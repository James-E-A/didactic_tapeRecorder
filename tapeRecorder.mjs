import { assign, createMachine, fromPromise, setup } from 'xstate';

import MediaRecorderStream from './lib/mediaRecorderStream.mjs';
import WakeLockEx from './lib/wakeLockEx.mjs';
import { showSaveFilePicker } from './lib/vendor/showSaveFilePicker.mjs?helperURL=https%3A%2F%2Fjames-e-a.github.io%2FshowSaveFilePicker_polyfill%2Fhelper.html';
import { byId, resourceActor } from './lib/xstate_helpers.mjs';

export default setup({
	actors: {
		mediaRecorderStream: resourceActor({
			acquire: ({ query, options }) => MediaRecorderStream.new(query, options),
			release: (recorder) => recorder.stop(),
		}),
		onBeforeUnloadLock: resourceActor({
			acquire: (callback) => {
				var controller = new AbortController();
				window.addEventListener(
					'onbeforeunload',
					(event) => {
						var shouldSuppress = true;
						try {
							if (callback !== undefined)
								shouldSuppress = (callback(event) !== false);
						} finally {
							if (shouldSuppress)
								event.preventDefault();
						}
					},
					{ signal: controller.signal }
				);
				return controller;
			},
			release: (controller) => controller.abort(null),
		}),
		pipeTo: fromPromise(
			({ input: { source, target, options }, signal }) =>
				// FIXME: consider using AbortSignal.any() to combine the xstate disposal signal and any specific signal in options
				source.pipeTo(target, options)
		),
		saveFileStream: resourceActor({
			acquire: async (options, signal) => {
				let handle = await showSaveFilePicker(options);
				signal.throwIfAborted();
				return await handle.createWritable();
			},
			release: async (writable) => {
				if (!writable.locked) {
					try {
						await writable.close();
					} catch (error) {
						if (error instanceof TypeError)
							return; // happy path
						else
							throw error;
					}
				} else {
					console.warn("actor disposed while writable still locked: %o", writable);
					await new Promise((resolve) => void setTimeout(resolve, 1000));
					writable.abort("actor disposed");
				}
			},
		}),
		wakeLock: resourceActor({
			acquire: (options, signal) =>
				// FIXME: consider using AbortSignal.any() to combine the xstate disposal signal and any specific signal in options
				WakeLockEx.acquire(options),
			release: (lock) => lock.release(),
		}),
	},

	guards: {
		byId,
	},
}).createMachine({
	id: "TapeRecorder",

	initial: "inactive",

	states: {
		inactive: {
			on: {
				action_record: {
					actions: assign({
						recorderOptions: ({ event }) => ({
							query: { audio: true, video: false },
							options: {
								mimeType: event.input?.mimeType,
								startImmediately: true,
								timeslice: event.input?.timeslice,
							},
						}),

						fileOptions: ({ event }) => ({
							suggestedName: event.input?.suggestedName,
						}),
					}),
					target: "recording",
				},
			},
		},

		recording: {
			on: {
				error: ".error",
			},

			invoke: [
				{
					id: "file",
					src: "saveFileStream",
					input: ({ context }) => context.fileOptions,
				},

				{
					id: "mic",
					src: "mediaRecorderStream",
					input: ({ context }) => context.recorderOptions,
				},
			],

			initial: "acquiring",

			states: {
				acquiring: {
					type: "parallel",

					on: {
						action_stop: {
							actions: () => {console.warn("early stop");},
							target: "done",
						},
					},

					states: {
						mic: {
							initial: "acquiring",
							states: {
								acquiring: {
									on: {
										ready: {
											guard: {
												type: "byId",
												params: "mic",
											},
											actions: assign({
												mic: ({ event }) => event.output
											}),
											target: "ready",
										},
									},
								},
								ready: { type: "final" },
							},
						},

						file: {
							initial: "acquiring",
							states: {
								acquiring: {
									on: {
										ready: {
											guard: {
												type: "byId",
												params: "file",
											},
											actions: assign({
												file: ({ event }) => event.output,
											}),
											target: "ready",
										},
									},
								},
								ready: { type: "final" },
							},
						},
					},

					onDone: {
						actions: ({ context }) => {if (context.mic.state === 'inactive') context.mic.start();},
						target: "recording",
					},
				},

				recording: {
					initial: "recording",

					invoke: [
						{
							id: "saving",
							src: "pipeTo",
							input: ({ context }) => ({
								source: context.mic,
								target: context.file
							}),
							onDone: "done",
							onError: "error",
						},

						{
							src: "onBeforeUnloadLock",
							input: ({ context }) => () => {
								// at least try to flush the recording so far to disk...
								try {
									context.mic._mediaRecorder?.requestData();
								} catch (error) {
									console.warn(error);
								}
							},
						},

						{
							src: "wakeLock",
						},
					],

					on: {
						action_stop: {
							actions: ({ context }) => {context.mic.stop();},
							target: ".stopping",
						},
					},
					states: {
						recording: {
							on: {
								action_pause: {
									actions: ({ context }) => {context.mic.pause();},
									target: "paused",
								},
							},
						},

						paused: {
							on: {
								action_resume: {
									actions: ({ context }) => {context.mic.resume();},
									target: "recording",
								},
							},
						},

						stopping: {
							on: {
								action_stop: {
									actions: () => {console.warn("early stop");}
									target: "#TapeRecorder.recording.done", // FIXME: why doesn't this work when written as "..done"?
								},
							},
						},
					},
				},

				error: {
					entry: "console_error",
					always: "done",
				},

				done: { type: "final" },
			},

			onDone: "inactive",
		},
	},
});
