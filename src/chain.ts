import { asyncCallWithTimeout } from "./timeout";
import dedent from "ts-dedent";
import dotenv from "dotenv";
import OpenAI from "openai";
import retry from "async-retry";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { logger } from "./logger";
import { jsons } from "./utils";

dotenv.config();

type ResponseFormat = {
  type: "text" | "json_object";
};

interface PullParameters {
  model?: string;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  max_tokens?: number;
  n?: number;
  presence_penalty?: number;
  response_format?: ResponseFormat;
  seed?: number;
  stop?: string | string[];
  temperature?: number;
  top_p?: number;
}

export class Chain {
  openai: OpenAI;
  model: string;
  system: ChatCompletionMessageParam | null;
  user_prompt: ChatCompletionMessageParam[];
  model_response: string | any | null;
  prompt_tokens: number;
  completion_tokens: number;

  constructor(model: string, api_key?: string, environ_key = "OPENAI_API_KEY") {
    if (!api_key) {
      api_key = process.env?.[environ_key];
    }

    if (!api_key) {
      throw new TypeError(dedent`
        OpenAI API key not found. Please set the OPENAI_API_KEY environment variable,
        pass in an api_key parameter, or set the environ_key parameter to the environment 
        variable that contains your API key.
      `);
    }

    this.openai = new OpenAI({
      apiKey: api_key,
    });

    this.model = model;
    this.system = null;
    this.user_prompt = [];
    this.model_response = null;
    this.prompt_tokens = 0;
    this.completion_tokens = 0;
  }

  private async try_query_and_parse(
    fn: Promise<any>,
    json_schema: any,
    max_query_time: number | undefined,
    stream = false,
  ) {
    const completion = await (max_query_time
      ? asyncCallWithTimeout(fn, max_query_time)
      : fn);

    if (!completion) {
      throw new Error("Query timed out");
    }

    if (stream) {
      return completion;
    }

    let message = completion.choices[0].message.content;

    if (json_schema) {
      const open_bracket = message.indexOf("{");
      const close_bracket = message.lastIndexOf("}") + 1;
      message = message.slice(open_bracket, close_bracket);
      try {
        return JSON.parse(message);
      } catch (e) {
        throw new Error(dedent`
          Response was not in the expected JSON format. Please try again. Check that you haven't accidentally lowered 
          the max_tokens parameter so that the response is truncated.
        `);
      }
    }

    this.prompt_tokens += completion.usage.prompt_tokens;
    this.completion_tokens += completion.usage.completion_tokens;

    return message;
  }

  private async ask({
    system,
    user_messages,
    json_schema,
    max_query_time,
    tries = 1,
    stream = false,
    params = {},
  }: {
    system: ChatCompletionMessageParam | null;
    user_messages: ChatCompletionMessageParam[];
    json_schema?: any;
    max_query_time?: number;
    tries?: number;
    stream?: boolean;
    params?: PullParameters;
  }) {
    const messages = system ? [system, ...user_messages] : user_messages;
    const message = await retry(
      async () => {
        return this.try_query_and_parse(
          this.openai.chat.completions.create({
            model: this.model,
            messages,
            stream,
            ...params,
          }),
          json_schema,
          max_query_time,
          stream,
        );
      },
      {
        retries: tries,
        onRetry: (e, attempt) => {
          logger.info(`Retrying query... Attempt ${attempt}.`);
        },
      },
    );

    return message;
  }

  anchor(system_prompt: string) {
    this.system = { role: "system", content: system_prompt };
    return this;
  }

  transform<T = any>(fn: (msg: T) => string) {
    if (this.model_response) {
      this.model_response = fn(this.model_response);
    }
    return this;
  }

  link(modifier: string | ((msg: string) => string), assistant?: boolean) {
    let prompt;
    if (typeof modifier === "string") {
      if (!modifier) {
        throw new Error("Modifier cannot be an empty string");
      }
      prompt = modifier;
    } else {
      if (!this.model_response) {
        throw new Error("No model response to link to");
      }
      prompt = modifier(this.model_response);
    }

    const role = assistant ? "assistant" : "user";

    this.user_prompt.push({ role, content: prompt });

    return this;
  }

  unhook() {
    this.system = null;
    this.user_prompt = [];
    return this;
  }

  last() {
    return this.model_response;
  }

  token_usage() {
    return {
      prompt_tokens: this.prompt_tokens,
      completion_tokens: this.completion_tokens,
    };
  }

  log() {
    logger.info("=".repeat(60));
    logger.info(`System: ${jsons(this.system)}`);
    logger.info(`User: ${jsons(this.user_prompt)}`);
    logger.info(`Text: ${jsons(this.model_response)}`);
    logger.info("=".repeat(60));
    return this;
  }

  log_tokens() {
    const { prompt_tokens, completion_tokens } = this.token_usage();
    logger.info("=".repeat(60));
    logger.info(`Prompt tokens: ${prompt_tokens}`);
    logger.info(`Completion tokens: ${completion_tokens}`);
    logger.info(`Total tokens: ${prompt_tokens + completion_tokens}`);
    logger.info("=".repeat(60));
    return this;
  }

  async pull({
    json_schema,
    tries = 1,
    max_query_time,
    params = {},
  }: {
    json_schema?: any;
    tries?: number;
    max_query_time?: number;
    params?: PullParameters;
  } = {}) {
    if (!params.model) {
      params.model = this.model;
    }

    params = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined),
    );

    if (json_schema) {
      if (typeof json_schema !== "object") {
        throw new Error("json_schema must be an object");
      }

      params.response_format = { type: "json_object" };
      params.model = "gpt-4-turbo-preview";

      this.user_prompt.push({
        role: "user",
        content: dedent`
          You must respond in the following example JSON format. Remember to enclose the entire JSON object in curly braces: 
          ${JSON.stringify(json_schema, null, 2)}
        `,
      });
    }

    const response = await this.ask({
      system: this.system,
      user_messages: this.user_prompt,
      json_schema,
      max_query_time,
      tries,
      params,
    });

    this.model_response = response;
    return this;
  }

  async *stream({
    plain_text_stream = false,
    max_query_time,
    params = {},
  }: {
    plain_text_stream?: boolean;
    max_query_time?: number;
    params?: PullParameters;
  } = {}) {
    if (!params.model) {
      params.model = this.model;
    }

    params = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined),
    );

    for await (const response of await this.ask({
      system: this.system,
      user_messages: this.user_prompt,
      json_schema: null,
      max_query_time,
      stream: true,
      params,
    })) {
      yield plain_text_stream ? response.choices[0].delta.content : response;
    }
  }
}
