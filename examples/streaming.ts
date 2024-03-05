import { Chain } from "../src";

const chain = new Chain("gpt-3.5-turbo");
chain.link("What is the capital of France?");

for await (const response of chain.stream({ plain_text_stream: true })) {
  console.log(response);
}
