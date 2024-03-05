import pino from "pino";
import pretty from "pino-pretty";

const stream = pretty({
  colorize: true,
  singleLine: true,
  colorizeObjects: true,
  translateTime: true,
  crlf: false,
  errorLikeObjectKeys: ["err", "error"],
  errorProps: "",
  levelFirst: false,
  messageKey: "msg",
  ignore: "pid,hostname",
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
  },
  stream,
);
