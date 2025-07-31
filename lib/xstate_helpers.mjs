import { assign, fromCallback, fromPromise } from 'xstate';

import { showSaveFilePicker } from './vendor/showSaveFilePicker.mjs?helperURL=https%3A%2F%2Fjames-e-a.github.io%2FshowSaveFilePicker_polyfill%2Fhelper.html';
import MediaRecorderStream from './mediaRecorderStream.mjs';
import WakeLockEx from './wakeLockEx.mjs';


var Promise_try = (Promise.try ?? function try_(func, ...arg) {
	return new this((resolve) => void resolve(func(...arg)));
}).bind(Promise);


export function getNextEvents(snapshot) {
	return Array.from(new Set(snapshot._nodes.flatMap((sn) => sn.ownEvents)));
}


export var pipeTo = fromPromise(({ input: { source, target, options } }) =>
	source.pipeTo(target, options)
);


export var onBeforeUnloadLock = resourceActor({
	acquire: (onbeforeunload) => {
		var controller = new AbortController();
		window.addEventListener(
			'beforeunload',
			(event) => {
				var shouldSuppress = true;
				try {
					if (onbeforeunload !== undefined && onbeforeunload(event) === false)
						shouldSuppress = false;
				} finally {
					if (shouldSuppress)
						event.preventDefault();
				}
			},
			{ signal: controller.signal }
		);
		return controller;
	},

	release: (controller) =>
		void controller.abort(null),
});


export var saveFileStream = resourceActor({
	acquire: async (options, signal) => {
		var handle = await showSaveFilePicker(options);
		signal.throwIfAborted();
		return await handle.createWritable();
	},

	release: async (writable) => {
		if (!writable.locked) {
			try {
				await writable.close();
			} catch (error) {
				if (error instanceof TypeError)
					// happy path, file was actually closed properly
					return;
				else
					throw error;
			}
			console.warn("disposed before writable was closed: %o", writable);
		} else {
			console.warn("disposed while writable was locked: %o", writable);
			await new Promise((resolve) => void setTimeout(resolve, 1000));
			writable.abort("actor disposed");
		}
	}
});


export var mediaRecorderStream = resourceActor({
	acquire: async ({ query, options }) =>
		await MediaRecorderStream.new(query, options),

	release: (recorder) =>
		recorder.stop()
});


export var wakeLock = resourceActor({
	acquire: async (options, signal) =>
		await WakeLockEx.acquire(options, signal),

	release: (lock) =>
		lock.release(),
});


export function resourceActor({ acquire, release }) {
	return fromCallback(({ input, self, sendBack }) => {
		var cancelController = new AbortController();
		var resource_ = Promise_try(acquire, input, cancelController.signal);

		resource_.then(
			(resource) => void sendBack({
				type: "ready",
				_senderId: self.id,
				output: resource,
			}),
			(error) => {
				cancelController.abort(error);
				sendBack({
					type: "error",
					_senderId: self.id,
					error,
				});
			}
		);

		return () => {
			cancelController.abort(null);
			resource_.then((resource) => release(resource));
		};
	});
}


export function byId({ event }, id) {
	// WORKAROUND: https://github.com/statelyai/xstate/issues/5335
	return event._senderId === id;
}
