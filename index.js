import ollama from 'ollama';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const HistoricalEvent = z.object({
  name: z.string(),
  date: z.string(),
  description: z.string(),
});

const Country = z.object({
  countryName: z.string(),
  isoCode: z.string(),
  capital: z.string(),
  languages: z.array(z.string()),
  historicalEvents: z.array(HistoricalEvent),
});

// Internally when you make calls against AI models with an API, it turns your
// message objects into a buffer like this. This is the "raw token form" that
// deepseek-r1:32b (based on Qwen 2.5 32b) understands.
let buffer = `Follow this JSON schema: ${JSON.stringify(zodToJsonSchema(Country))}
<｜User｜>Tell me about Canada.<｜end▁of▁sentence｜>
<｜Assistant｜><think>Okay`;

// Twiddle the reasoning effort to get a more detailed reasoning stage; this
// will spend more time in the reasoning phase of the response, but can give
// "better" results.
let reasoningEffort = 2;

// This loop will keep asking the model for more information until it's
// exhausted the reasoning effort.
while (reasoningEffort > 0) {
  reasoningEffort--;

  // XXX(Xe): this is a HACK to get the runtime to only append "Wait" if it's
  // generated more than zero responses.
  if (reasoningEffort != 1) {
    // This is the key part of the paper as outlined in Section 3.1. Append "Wait"
    // to the buffer to coax the model into continuing the reasoning phase.
    buffer += '\nWait';
  }

  // Generate a single response from the model.
  const response = await ollama.generate({
    model: 'deepseek-r1:32b',
    prompt: buffer,
    raw: true,
    options: {
      // Seed obtained from Torch.manual_seed(3407) is all you need (arXiv:2109.08203v2)
      seed: 3407,
      // This is the list of tokens that the model should stop at. It's important
      // that </think> be included in this list. That is the token that DeepSeek R1
      // and the distilled models (such as the Qwen 2.5 32b this example uses) use
      // to denote the end of the reasoning phase of the response.
      //
      // The other tokens are included just to be safe.
      stop: ['<｜begin▁of▁sentence｜>', '<｜end▁of▁sentence｜>', '<｜Assistant｜>', '<｜User｜>', '</think>'
      ],
    }
  });
  // Append the generated reasoning tokens to the buffer.
  buffer += response.response;
}

// Close the <think> tag.
buffer += '</think>';

// Generate the final response, fed by the multiple reasoning stages.
const response = await ollama.generate({
  model: 'deepseek-r1:32b',
  prompt: buffer,
  raw: true,
  // Coerce the response to be a JSON object matching the Country schema.
  format: zodToJsonSchema(Country),
  options: {
    // Seed obtained from Torch.manual_seed(3407) is all you need (arXiv:2109.08203v2)
    seed: 3407,
  }
});

// Parse the response into a Country object. This should not fail.
const country = Country.parse(JSON.parse(response.response));

// Spew the reasoning phase.
console.log(buffer);
// Spew the final response.
console.log(country);