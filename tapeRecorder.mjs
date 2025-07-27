import { assign, createMachine, setup } from 'xstate';

import { byId, contextCall, onBeforeUnloadLock, mediaRecorderStream, pipeTo, saveFileStream, wakeLock } from './xstate_helpers.mjs';

export default setup({
	actors: {
		onBeforeUnloadLock,
		mediaRecorderStream,
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
								startImmediately: event.input.startImmediately ?? true,
								mimeType: event.input.mimeType,
							},
						}),
						fileOptions: ({ event }) => ({
							suggestedName: event.input.suggestedName,
						}),
					}),
					target: "recording",
				},
			},
		},

		recording: {
			on: {
				error: { // asynchronous error in invoked actor
					actions: "console_error",
					target: ".error",
				},
			},

			invoke: [
				{
					id: "mic",
					src: "mediaRecorderStream",
					input: ({ context }) => ({
						query: { audio: true, video: false },
						options: context.recorderOptions,
					}),
					onError: { // synchronous error in invoked actor
						actions: "console_error",
						target: ".error",
					},
				},

				{
					id: "file",
					src: "saveFileStream",
					input: ({ context }) => context.fileOptions,
					onError: { // synchronous error in invoked actor
						actions: "console_error",
						target: ".error",
					},
				},

				{
					src: "onBeforeUnloadLock",
					onError: { // synchronous error in invoked actor
						actions: "console_error",
						target: ".error",
					},
				},

				{
					src: "wakeLock",
					onError: { // synchronous error in invoked actor
						actions: "console_error",
						target: ".error",
					},
				},
			],

			initial: "acquiring",

			states: {
				acquiring: {
					type: "parallel",

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

					onDone: "recording",
				},

				recording: {
					initial: "recording",

					invoke: {
						id: "saving",
						src: "pipeTo",
						input: ({ context }) => ({
							source: context.mic,
							target: context.file
						}),
						onDone: "done",
						onError: { // synchronous error in invoked actor
							actions: "console_error",
							target: "error",
						},
					},

					entry: ({ context }) => {if (context.mic.state === 'inactive') context.mic.start();},

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

				// the illusion of choice...
				done: { type: "final" },
				error: { type: "final" },
			},

			onDone: "#TapeRecorder.inactive", // FIXME: why doesn't this work when written as "..inactive"?
		},
	},
});
