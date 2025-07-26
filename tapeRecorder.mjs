import { assign, createMachine, setup } from 'xstate';

import { byId, contextCall, onBeforeUnloadLock, mediaRecorderStream, pipeTo, saveFileStream } from './xstate_helpers.mjs';

export default setup({
	actions: {
		contextCall,
	},
	actors: {
		onBeforeUnloadLock,
		mediaRecorderStream,
		pipeTo,
		saveFileStream,
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
							mimeType: event.input.mimeType,
							startImmediately: true,
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
					invoke: [
						{
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
					],
					on: {
						action_stop: ".stopping",
					},
					states: {
						recording: {
							on: {
								action_pause: "paused",
							},
						},
						paused: {
							entry: {
								type: "contextCall",
								params: { key: "mic", method: "pause" },
							},
							on: {
								action_resume: {
									actions: {
										type: "contextCall",
										params: { key: "mic", method: "resume" },
									},
									target: "recording",
								},
							},
						},
						stopping: {
							entry: {
								type: "contextCall",
								params: { key: "mic", method: "stop" },
							},
						},
					},
				},
				done: { type: "final" },
				error: { type: "final" },
			},
			onDone: "#TapeRecorder.inactive", // FIXME: why doesn't this work when written as "..inactive"?
		},
	},
});
