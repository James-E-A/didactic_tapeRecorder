import { assign, createMachine, setup } from 'xstate';

import { byId, onBeforeUnloadLock, mediaRecorderStream, pipeTo, saveFileStream, wakeLock } from './lib/xstate_helpers.mjs';

export default setup({
	actors: {
		mediaRecorderStream,
		onBeforeUnloadLock,
		pipeTo,
		saveFileStream,
		wakeLock,
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
							target: "#TapeRecorder.inactive",
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
						stopping: {},
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
