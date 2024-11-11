import { Chain } from '../src';

let chain = new Chain('gpt-3.5-turbo');

// ================================================

chain = await chain
  .anchor('You are a historian.') // Set the first system prompt
  .link('What is the capital of France?')
  .pull();

chain = chain.log().unhook();

// ================================================

chain = await chain
  .link((desc) => `Extract the city in this statement: ${desc}`)
  .pull({ json_schema: { city: 'string' } });

chain = chain.transform<{ city: string }>((city_json) => city_json.city);

chain = chain.log().unhook();

// ================================================

chain = await chain
  .anchor('You are an expert storyteller.')
  .link(
    (city) => `Design a basic three-act point-form short story about ${city}.`
  )
  .link('How long should it be?', true)
  .link('Around 100 words.')
  .pull({ params: { max_tokens: 512 } });

chain = chain.log().unhook();

// ================================================

chain = await chain
  .anchor(
    'You are a novelist. Your job is to write a novel about a story that you have heard.'
  )
  .link(
    (storyline) =>
      `Briefly elaborate on the first act of the storyline: ${storyline}`
  )
  .pull({ params: { max_tokens: 256, model: 'gpt-4-turbo' } });

chain = chain.log().unhook();

// ================================================

chain = await chain
  .link((act) => `Summarize this act in around three words:\n${act}`)
  .pull({ params: { model: 'gpt-4-turbo' } });

chain.log_tokens();

console.log(`Result: ${chain.last()}`); // Print the last response
