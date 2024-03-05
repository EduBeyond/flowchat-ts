# flowchat - clean, readable, logical code.

[![License](https://img.shields.io/pypi/l/flowchat?logoColor=blue)](LICENSE.txt)

A TypeScript library for building clean and efficient multi-step prompt chains, ported from the [flowchat python library](https://github.com/flatypus/flowchat). It is built on top of [OpenAI's NodeJS/TS API](https://github.com/openai/openai-node).

## What is Flowchat?
Flowchat is designed around the idea of a *chain*. Start the chain with `.anchor()`, which contains a system prompt. Use `.link()` to add additional messages.

To get a response from the LLM, use `.pull()`. Additionally, you can use `.pull({json_schema:{"city": "string"}})` to define a specific output response schema. This will validate the response and return a JSON object with the response. The subsequent response will be stored in an internal response variable.

When you're done one stage of your chain, you can log the chain's messages and responses with `.log()` and reset the current chat conversation messages with `.unhook()`.
Unhooking **does not** reset the internal response variable. 

Instead, the idea of 'chaining' is that you can use the response from the previous stage in the next stage.
For example, when using `link` in the second stage, you can use the response from the first stage by using a lambda function: ```.link((response)=>`Previous response: ${response}`)```. 

You can use `.transform()` to transform the response from the previous stage into something else. For example, you can use `.transform<{response: {city: string}}>((response)=>response.city)` to get the city from the response JSON object, or even map over a response list with a nested chain!

When you're finished with the entire chain, simply use `.last()` to return the last response.

Check out these [example chains](/examples) to get started!


## Setup
Put your OpenAI API key in your environment variable file (eg. .env) as `OPENAI_API_KEY=sk-xxxxxx`. If you're using this as part of another project with a different name for the key (like `OPENAI_KEY` or something), simply pass that in `Chain("gpt-3.5-turbo", {environ_key:"OPENAI_KEY"})`. Alternatively, you can simply pass the key itself when initializing the chain: `Chain("gpt-3.5-turbo", {api_key:"sk-xxxxxx"})`.

## Example Usage
```ts
let chain = new Chain("gpt-3.5-turbo");

chain = await chain
.anchor("You are a historian.")
.link("Who won the Battle of Waterloo?")
.pull({json_schema:{"winner": "string"}})

chain = chain.transform<{winner: string}>(({winner}) => winner)
chain = chain.log().unhook();

// Now, the AI model is an assistant writing a short story about the city returned in the earlier prompt
chain = await chain
.anchor("You are a helpful assistant.")
.link((winner) => `Write a short story about ${winner}.`)
.pull()

chain = chain.log().unhook();   

console.log(`Story: ${chain.last()}`); // Print the last response
```

This project is under a MIT license.
