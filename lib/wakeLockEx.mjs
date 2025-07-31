export default class WakeLockEx {
	static async acquire(options) {
		return new this(await this.#acquire(options), options);
	}

	static async #acquire(options, signal) {
		var type = options?.type,
		    signal = options?.signal;

		ready: {
			retry: for (
				let attemptCount = 0,
				    maxAttempts = options?.maxAttempts ?? Number.MAX_SAFE_INTEGER,
				    timeout = 1000 ;
				attemptCount < maxAttempts ;
				attemptCount++
			) {
				try {
					var sentinel = await navigator.wakeLock.request(type);
				} catch (error) {
					signal?.throwIfAborted();
					console.warn(error);
					await waitForFocus(timeout).catch(() => undefined);
					signal?.throwIfAborted();
					timeout *= 1.618033988749895;
					continue retry;
				}
				break ready;
			}
			throw new Error("WakeLockEx: maximum retries exceeded");
		}
		return sentinel;
	}

	#releaseController;
	#currentSentinel;
	#options;
	constructor(existingNonReleasedSentinel, options) {
		var releaseController = this.#releaseController = new AbortController();
		releaseController.signal.addEventListener('abort', this.#onabort.bind(this));

		this.#currentSentinel = existingNonReleasedSentinel;
		this.#currentSentinel.addEventListener('release', this.#onrelease.bind(this), { once: true });

		this.#options = options;
	}

	release() {
		this.#releaseController.abort(null);
	}

	async #onrelease(event) {
		if (this.#releaseController.signal.aborted)
			return;

		console.debug("LOST WAKELOCK. RE-ACQUIRING...");
		this.#currentSentinel = await this.__proto__.constructor.#acquire(this.#options);
		this.#currentSentinel.addEventListener('release', this.#onrelease.bind(this), { once: true });
	}

	#onabort(event) {
		this.#currentSentinel.release();
	}
}


async function waitForFocus(timeout) {
	var cleanup = new AbortController();
	return await new Promise((resolve, reject) => {
		resolve = ((c, f) => (x) => (c.abort(null), f(x)))(cleanup, resolve);
		reject = ((c, f) => (x) => (c.abort(x), f(x)))(cleanup, reject);
		window.addEventListener('focus', resolve, { signal: cleanup.signal });
		document.addEventListener('focus', (event) => {if(event.target.visibilityState === 'visible') resolve(event);}, { signal: cleanup.signal });
		if (timeout !== undefined) {
			const timeoutId = setTimeout(reject, timeout, new DOMException("The operation timed out.", 'TimeoutError'));
			cleanup.signal.addEventListener('abort', () => void clearTimeout(timeoutId), { once: true });
		}
	});
}
