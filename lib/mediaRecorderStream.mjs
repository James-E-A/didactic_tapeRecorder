export default class MediaRecorderStream {
	static #TIMESLICE_DEFAULT = 1000;

	static async new(query, options) {
		// stop tracks, because we own this mediaStream & it would be utterly uncollected otherwise
		options = Object.assign({ _stopTracksAlso: true }, options);
		return new this(
			await navigator.mediaDevices.getUserMedia(query),
			options
		);
	}

	#mediaStream;
	#mediaRecorder;
	#readableStream;
	#options;
	constructor(mediaStream, options) {
		this.#mediaStream = mediaStream;
		this.#options = options;
		var mediaRecorder = this.#mediaRecorder = new MediaRecorder(
			mediaStream,
			{ mimeType: options?.mimeType }
		);
		this.#readableStream = new ReadableStream(
			new this.__proto__.constructor.#underlyingSource(
				mediaRecorder,
				options
			),
			options?._queueingStrategy
		);
		if (options?.startImmediately ?? false)
			this.start();
	}

	start() {
		// undefined = "use the default timeslice"
		// null = "don't use timeslice"

		let timeslice = this.#options?.timeslice;
		if (timeslice === undefined) timeslice = this.__proto__.constructor.#TIMESLICE_DEFAULT;
		let timeslice_ = timeslice === null ? undefined : timeslice;
		this.#mediaRecorder.start(timeslice_);
		console.debug("START OK");
	}

	pause() {
		this.#mediaRecorder.pause();
		if (this.#options?.flushOnPause ?? true)
			this.#mediaRecorder.requestData();
		console.debug("PAUSE OK");
	}

	resume() {
		this.#mediaRecorder.resume();
		console.debug("RESUME OK");
	}

	stop() {
		this.#mediaRecorder.stop();
		if (this.#options?._stopTracksAlso ?? false) {
			// https://stackoverflow.com/questions/44274410/mediarecorder-stop-doesnt-clear-the-recording-icon-in-the-tab
			for (let track of this.#mediaStream.getTracks()) {
				track.stop();
			}
		}
		console.debug("STOP OK");
	}

	get state() {
		return this.#mediaRecorder.state;
	}

	async pipeTo(target, options) {
		await this.#readableStream.pipeTo(target, options);
	}

	pipeThrough(transform, options) {
		return this.#readableStream.pipeThrough(transform, options);
	}

	async *[Symbol.asyncIterator]() {
		yield* this.#readableStream;
	}

	get _mediaStream() {
		return this.#mediaStream;
	}

	get _mediaRecorder() {
		return this.#mediaRecorder;
	}

	static #underlyingSource = class {
		#mediaRecorder;
		#abortController;
		constructor(recorder, options) {
			this.#mediaRecorder = recorder;
			this.#abortController = new AbortController();
			this.type = options?._type;
		}

		start(controller) {
			this.#mediaRecorder.addEventListener(
				'dataavailable',
				({ data }) => {try {controller.enqueue(data);} catch (error) {this.#abortController.abort(error);} },
				{ signal: this.#abortController.signal }
			);
			this.#mediaRecorder.addEventListener(
				'error',
				({ error }) => {try {controller.error(error);} finally {this.#abortController.abort(error);}},
				{ signal: this.#abortController.signal }
			);
			this.#mediaRecorder.addEventListener(
				'stop',
				() => {try {controller.close();} finally {this.#abortController.abort(null);}},
				{ signal: this.#abortController.signal }
			);
			this.#abortController.signal.addEventListener(
				'abort',
				() => {this.#mediaRecorder.stop();},
				{ once: true }
			);
		}

		pull = undefined;

		cancel(reason) {
			this.#mediaRecorder.stop();
		}

		type;

		autoAllocateChunkSize;
	}
}