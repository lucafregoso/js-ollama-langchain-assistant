import Fastify from "fastify";
// import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { ChatOllama } from "@langchain/ollama";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { generateTranscription, whispercpp } from "modelfusion";
import fs from "node:fs";
import { isValidUrl } from "./lib/index.js";

import {
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
  ChatPromptTemplate,
} from "@langchain/core/prompts";

let ollama_base_url = process.env.OLLAMA_BASE_URL;

const fastify = Fastify({
  logger: false,
});

const { ADDRESS = "0.0.0.0", PORT = "8081" } = process.env;

fastify.post("/coder", async (request, reply) => {
  const model = new ChatOllama({
    baseUrl: ollama_base_url,
    model: "deepseek-coder",
    temperature: 0,
    repeatPenalty: 1,
    verbose: false,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      `You are an expert in computer programming.
     Please make friendly answer for the noobs.
     Add source code examples if you can.
     Your replies can be only structured in valid JSON strings.
    `
    ),
    HumanMessagePromptTemplate.fromTemplate(
      `I need a clear explanation regarding my {question}.
     And, please, be structured with bullet points and respect a valid JSON string output.
    `
    ),
  ]);

  const question = request.body["question"];
  const outputParser = new StringOutputParser();
  const chain = prompt.pipe(model).pipe(outputParser);

  // let stream = await chain.stream({
  //   question: question,
  // });
  let stream = await chain.invoke({
    question: question,
  });

  reply.header("Content-Type", "application/json");
  return reply.send({ res: stream });
});

fastify.post("/url", async (request, reply) => {
  // Input validation
  const { url } = request.body;

  if (!url || !isValidUrl(url)) {
    return reply.code(400).send({ error: "Invalid URL provided" });
  }

  const llm = "llama3:latest"; 
  // const llm = "qwen:32b";

  const model = new ChatOllama({
    baseUrl: ollama_base_url,
    model: llm,
    temperature: 0,
    repeatPenalty: 1,
    verbose: false,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(
      `You are an expert in computer programming and web scraping.
      You can reply only in valid strict json format without any other text (also cannot be a markdown enclosed in \`\`\`json), using an object with the keys: 
        - url, 
        - category (choose between music, science, business, lifestyle, work, cinema, spare time, cooking, sport, other),
        - title,
        - header,
        - subheader,
        - excerpt wich is a summary of the content obtained analyzing the page at the URL I'm pasting.
        Please treat each one as the starting point of the analysis to get unbiased data.
        If I'm pasting a google search page try to get detailed infos from the element with data-attrid="description".
        `
    ),
    HumanMessagePromptTemplate.fromTemplate(`{url}`),
  ]);

  let responseBody = "";

  try {
    // Fetch with timeout and size limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      signal: controller.signal,
      size: 1024 * 1024 * 15, // 15MB limit
    });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("text/html")) {
      throw new Error("URL must point to an HTML page");
    }

    responseBody = await response.text();
  } catch (error) {
    clearTimeout(timeout);
    console.error(error.message);
    return {};
  }

  const outputParser = new StringOutputParser();
  const chain = prompt.pipe(model).pipe(outputParser);

  /*
  let stream = await chain.stream({
    url: url,
    responseBody: responseBody,
  });

  let res = "";
  for await (const s of stream({
    url: url,
    responseBody: responseBody,
  })) {
    console.log(s);
    res += s;
  }
  */

  const res = await chain.invoke({
    url: url,
    responseBody: responseBody,
  });

  // Remove markdown JSON code block if present
  const cleanRes = res.replace(/```json\n?|\n?```/g, '');
  // Normalize newlines and escape sequences
  const normalizedRes = cleanRes
    .trim()
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
  const resObj = {...JSON.parse(normalizedRes), responseBody};

  console.log({ res, resObj });
  /*
  reply.header("Content-Type", "application/octet-stream");
  // return reply.send(stream);
  */
  return { data: resObj };
});

fastify.post("/transcribe", async (request, reply) => {
  const filepath = request.body["filepath"];

  const audioData = await fs.promises.readFile(filepath);

  const transcription = await generateTranscription({
    model: whispercpp.Transcriber({
      // Custom API configuration:
      api: whispercpp.Api({
        baseUrl: { host: "localhost", port: "8080" },
      }),
    }),
    mimeType: "audio/wav",
    audioData,
  });

  reply.header("Content-Type", "application/octet-stream");
  return reply.send(transcription);
});

const start = async () => {
  try {
    await fastify.listen({ host: ADDRESS, port: parseInt(PORT, 10) });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${ADDRESS}:${PORT}`);
};
start();
