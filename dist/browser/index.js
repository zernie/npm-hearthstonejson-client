(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global['hearthstonejson-client'] = factory());
}(this, (function () { 'use strict';

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var browser = createCommonjsModule(function (module, exports) {
module.exports = exports = window.fetch;
exports.Headers = window.Headers;
exports.Request = window.Request;
exports.Response = window.Response;
});

var browser_1 = browser.Headers;
var browser_2 = browser.Request;
var browser_3 = browser.Response;

var NoOpStorageBackend = /** @class */ (function () {
    function NoOpStorageBackend() {
    }
    NoOpStorageBackend.prototype.has = function (key) {
        return false;
    };
    NoOpStorageBackend.prototype.set = function (key, value) {
        return;
    };
    NoOpStorageBackend.prototype.get = function (key) {
        return null;
    };
    return NoOpStorageBackend;
}());

var LocalStorageBackend = /** @class */ (function () {
    function LocalStorageBackend() {
    }
    LocalStorageBackend.prototype._available = function () {
        try {
            return "localStorage" in window && window["localStorage"] !== null;
        }
        catch (e) {
            return false;
        }
    };
    LocalStorageBackend.prototype.has = function (key) {
        if (!this._available()) {
            return false;
        }
        return typeof localStorage[key] === "string";
    };
    LocalStorageBackend.prototype.set = function (key, value) {
        if (!this._available()) {
            return;
        }
        var compressed = JSON.stringify(value);
        do {
            try {
                localStorage.setItem(key, compressed);
                break;
            }
            catch (e) {
                try {
                    var key_1 = localStorage.key(0);
                    if (key_1) {
                        localStorage.removeItem(key_1);
                    }
                }
                catch (e) {
                    break;
                }
            }
        } while (localStorage.length);
    };
    LocalStorageBackend.prototype.get = function (key) {
        if (!this._available()) {
            return null;
        }
        return JSON.parse(localStorage[key]);
    };
    return LocalStorageBackend;
}());

var CacheProxy = /** @class */ (function () {
    function CacheProxy(backend) {
        this.cache = {};
        this.backend = backend;
    }
    CacheProxy.prototype.has = function (key) {
        if (typeof this.cache[key] !== "undefined") {
            return true;
        }
        return this.backend.has(key);
    };
    CacheProxy.prototype.set = function (key, value) {
        this.cache[key] = value;
        this.backend.set(key, value);
    };
    CacheProxy.prototype.get = function (key) {
        if (typeof this.cache[key] !== "undefined") {
            return this.cache[key];
        }
        return this.backend.get(key);
    };
    return CacheProxy;
}());

var REVISIONS = {
    18336: 4,
    20457: 1,
    22115: 1,
    22611: 1,
    24769: 1,
    25770: 1,
    31268: 1,
};

var HearthstoneJSON = /** @class */ (function () {
    function HearthstoneJSON(storage) {
        var _this = this;
        this.storagePrefix = "hsjson-";
        this.endpoint = "https://api.hearthstonejson.com/v1/";
        this.defaultLocale = "enUS";
        this.cached = null;
        this.fallback = null;
        this.createUrl = function (build, locale) {
            return _this.endpoint + build + "/" + locale + "/cards.json";
        };
        this.extractBuild = function (url) {
            var endpointExpression = new RegExp(_this.endpoint.replace(/[\/.]/g, "\\$&"));
            var pathExpression = /((\d+)|(latest))\/[a-zA-Z]+\/cards\.json/;
            var pattern = new RegExp("^" + endpointExpression.source + pathExpression.source + "$");
            var matches = pattern.exec(url);
            if (!matches) {
                throw new Error('No build found in url "' + url + '"');
            }
            return matches[1];
        };
        if (storage === null) {
            this.storage = new NoOpStorageBackend();
        }
        else if (typeof storage === "undefined") {
            this.storage = new CacheProxy(new LocalStorageBackend());
        }
        else {
            this.storage = storage;
        }
    }
    HearthstoneJSON.prototype.get = function (build, locale) {
        var _this = this;
        if (build === "latest") {
            return this.getLatest(locale);
        }
        var _locale = locale ? locale : this.defaultLocale;
        this.fallback = false;
        return this.getSpecificBuild(build, _locale).catch(function () {
            _this.fallback = true;
            return _this.fetchLatestBuild(_locale);
        });
    };
    HearthstoneJSON.prototype.getLatest = function (locale) {
        if (!locale) {
            locale = this.defaultLocale;
        }
        this.fallback = false;
        return this.fetchLatestBuild(locale);
    };
    HearthstoneJSON.prototype.getSpecificBuild = function (build, locale) {
        var _this = this;
        var key = this.generateKey(build, locale);
        var bypassCache = false;
        if (this.storage.has(key)) {
            var stored = this.storage.get(key);
            // verify format
            if (typeof stored === "object" &&
                typeof stored["revision"] === "number" &&
                Array.isArray(stored["cards"])) {
                if (stored["revision"] >= this.getRevision(build)) {
                    this.cached = true;
                    return Promise.resolve(stored["cards"]);
                }
            }
            // local version is not valid or outdated, do a full reload
            bypassCache = true;
        }
        this.cached = false;
        return this.fetchSpecificBuild(build, locale, bypassCache).catch(function (error) {
            // possibly invalid CORS header in cache
            return _this.fetchSpecificBuild(build, locale, true);
        });
    };
    HearthstoneJSON.prototype.fetchSpecificBuild = function (build, locale, bypassCache) {
        var _this = this;
        var headers = new Headers();
        headers.set("accept", "application/json; charset=utf-8");
        return fetch(this.createUrl(build, locale), {
            method: "GET",
            mode: "cors",
            cache: bypassCache ? "reload" : "default",
            headers: headers,
        })
            .then(function (response) {
            var statusCode = response.status;
            if (statusCode !== 200) {
                throw new Error("Expected status code 200, got " + statusCode);
            }
            return response.json();
        })
            .then(function (payload) {
            _this.store(build, locale, payload);
            return payload;
        });
    };
    HearthstoneJSON.prototype.fetchLatestBuild = function (locale) {
        var _this = this;
        return this.fetchLatestBuildNumber(locale).then(function (build) {
            return _this.getSpecificBuild(build, locale);
        });
    };
    HearthstoneJSON.prototype.fetchLatestBuildNumber = function (locale) {
        var _this = this;
        return fetch(this.createUrl("latest", locale), {
            method: "HEAD",
            mode: "cors",
            cache: "no-store",
        }).then(function (response) {
            // we expect to be redirected
            var statusCode = response.status;
            if (statusCode !== 200) {
                throw new Error("Expected status code 200, got " + statusCode);
            }
            // extract build number
            var build = _this.extractBuild(response.url);
            if (isNaN(+build)) {
                throw new Error("Expected numeric build number");
            }
            var buildNumber = +build;
            return buildNumber;
        });
    };
    HearthstoneJSON.prototype.store = function (buildNumber, locale, payload) {
        if (!payload.length) {
            // this doesn't look right - refuse to cache this
            return;
        }
        var key = this.generateKey(buildNumber, locale);
        this.storage.set(key, {
            revision: this.getRevision(buildNumber),
            cards: payload,
        });
    };
    HearthstoneJSON.prototype.generateKey = function (build, locale) {
        if (build === "latest") {
            throw new Error('Refusing to generate key for "latest" metadata');
        }
        return this.storagePrefix + build + "_" + locale;
    };
    HearthstoneJSON.prototype.getRevision = function (build) {
        var _build = "" + build;
        var revision = 0;
        if (typeof REVISIONS[_build] === "number") {
            revision = REVISIONS[_build];
        }
        return revision;
    };
    return HearthstoneJSON;
}());

return HearthstoneJSON;

})));
