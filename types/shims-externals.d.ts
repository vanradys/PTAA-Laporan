declare module "express" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  export interface Request extends IncomingMessage {
    id?: string;
    url?: string;
    method?: string;
  }

  export interface Response extends ServerResponse {
    statusCode: number;
  }

  export interface Router {
    use(...handlers: any[]): any;
  }

  export interface Express extends Router {
    options(path: string, ...handlers: any[]): any;
    json(...args: any[]): any;
    urlencoded(...args: any[]): any;
  }

  function express(): Express;
  namespace express {
    export function json(...args: any[]): any;
    export function urlencoded(...args: any[]): any;
  }
  export default express;
  export type { Express, Router, Request, Response };
}

declare module "cors" {
  export interface CorsOptions {
    origin?: boolean | string | string[] | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);
    credentials?: boolean;
    methods?: string[];
    allowedHeaders?: string[];
  }

  function cors(options?: CorsOptions): any;
  export default cors;
}

declare module "cookie-parser" {
  function cookieParser(secret?: string): any;
  export default cookieParser;
}

declare module "pino-http" {
  export interface PinoHttpOptions {
    logger?: any;
    serializers?: any;
  }

  function pinoHttp(options?: PinoHttpOptions): any;
  export default pinoHttp;
}

declare module "@workspace/*" {
  const value: any;
  export = value;
}
