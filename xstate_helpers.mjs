import { assign, fromCallback, fromPromise } from 'xstate';

import MediaRecorderStream from './MediaRecorderStream.mjs';


var Promise_try = Promise.try ?? function try_(func, ...arg) {
	return new Promise((resolve) => func(...arg));
};


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
				if (onbeforeunload === undefined || onbeforeunload(event) !== false)
					event.preventDefault();
			},
			{ signal: controller.signal }
		);
		return controller;
	},

	release: (controller) => {
		controller.abort(null);
	},
});


export var saveFileStream = resourceActor({
	acquire: (options, earlyAbortSignal) =>
		window.showSaveFilePicker(options)
		.then((handle) =>
			!earlyAbortSignal.aborted
			? handle.createWritable()
			: Promise.reject(earlyAbortSignal.reason)
		),

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
			console.log("disposed before writable was closed: %o", writable);
		} else {
			console.warning("disposed while writable was locked: %o", writable);
			await new Promise((resolve) => {setTimeout(resolve, 1000);});
			writable.abort("actor disposed");
		}
	}
});


export var mediaRecorderStream = resourceActor({
	acquire: ({ query, options }) =>
		MediaRecorderStream.new(query, options),

	release: (recorder) =>
		recorder.stop()
});


export function resourceActor({ acquire, release }) {
	return fromCallback(({ input, self, sendBack }) => {
		var earlyAbort = new AbortController();
		var resource_ = Promise_try(acquire, input, earlyAbort.signal);
		resource_.then(
			(resource) => void sendBack({
				type: "ready",
				id: self.id,
				output: resource,
			}),
			(error) => void sendBack({
				type: "error",
				error,
			})
		);
		resource_.finally(() => void earlyAbort.abort(null));
		return () => {
			earlyAbort.abort();
			resource_.then((resource) => release(resource));
		};
	});
}


export function byId({ event }, id) {
	// WORKAROUND: https://github.com/statelyai/xstate/issues/5335
	return event.id === id;
}


export function contextCall({ context }, { key, method, params }) {
	context[key][method](params);
}
