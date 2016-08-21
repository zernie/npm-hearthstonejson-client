/// <reference path="../node_modules/@types/node/index.d.ts"/>

import * as https from "https";
import * as URL from "url";
import {IncomingMessage} from "http";
import {StorageBackend} from "./StorageBackend";
import LocalStorageBackend from "./LocalStorageBackend";

export default class MetaDataManager {

	public defaultLocale: string = "enUS";
	public backend: StorageBackend;
	public cached: boolean = null;
	public fetched: boolean = null;
	public fallback: boolean = null;
	public prefix: string = "hsjson-";
	protected sourceUrl: (build: number|"latest", locale: string) => string;

	constructor(sourceUrl?: (build: number|"latest", locale: string) => string, backend?: StorageBackend) {
		this.sourceUrl = sourceUrl ? sourceUrl : (build: number|"latest", locale: string) => "http://api.hearthstonejson.com/v1/" + build + "/" + locale + "/cards.json";
		this.backend = backend ? backend : new LocalStorageBackend();
	}

	protected generateKey(build: number|"latest", locale: string): string {
		if (build === "latest") {
			throw new Error('Will not generate key for "latest" metadata');
		}
		return this.prefix + build + "_" + locale;
	}

	protected fetch(build: number|"latest", locale: string, cb?: (data: any[]) => void, errorCb?: () => void): void {
		let url = this.sourceUrl(build, locale);
		let options = URL.parse(url) as any;
		options.withCredentials = false;
		options.method = "GET";
		console.log("outgoing", options);
		let request = https.request(options);
		request.once("response", (message: IncomingMessage) => {
			console.log("incoming");
			if(message.statusCode != 200) {
				console.log("error");
				errorCb();
				return;
			}
			let data = "";
			message.on("data", (chunk) => {
				data += chunk;
			});
			message.on("error", () => {
				errorCb();
			});
			console.log("go?");
			message.on("end", () => {
				console.log("done");
				try {
					let cards = JSON.parse(data);
					cb(cards);
				}
				catch(e) {
					errorCb();
				}
			});
		});
		request.on("error", (e) => {
			console.error(e);
		});
		request.on("end", (e) => {
			console.log("end", e);
		});
		request.on("close", (e) => {
			console.log("close", e);
		});
		request.end();
	}

	protected has(build: number|"latest", locale: string): boolean {
		if (build === "latest") {
			return false;
		}
		return this.backend.has(this.generateKey(build, locale));
	}

	public get(build: number|"latest", locale: string, cb: (data: any[]) => void): void {
		if (typeof locale === "function" && typeof cb === "undefined") {
			cb = locale as (data: any[]) => void;
			locale = this.defaultLocale;
		}
		if (!build || isNaN(+build)) {
			build = "latest";
		}
		this.cached = false;
		let key = this.generateKey(build, locale);
		if (build !== "latest") {
			this.fetched = false;
			this.fallback = false;
			if (this.backend.has(key)) {
				this.cached = true;
				cb(this.backend.get(key));
				return;
			}
		}
		this.fetch(build, locale, (data: any[]) => {
			this.fetched = true;
			if(!this.fallback) {
				this.fallback = false;
			}
			cb(data);
			if (build !== "latest") {
				this.backend.set(key, data);
			}
		}, () => {
			if(build === "latest") {
				if(locale === this.defaultLocale) {
					// completely failed
					return;
				}
				else {
					locale = this.defaultLocale;
				}
			}
			// fallback to latest
			this.fallback = true;
			this.get("latest", locale, cb);
		});
	}

	public getLatest(locale: string, cb: (data: any[]) => void): void {
		this.get("latest", locale, cb);
	}
}