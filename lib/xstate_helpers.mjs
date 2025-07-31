import { assign, fromCallback, fromPromise } from 'xstate';


export var Promise_try = (Promise.try ?? function try_(func, ...arg) {
	return new this((resolve) => void resolve(func(...arg)));
}).bind(Promise);


export function getNextEvents(snapshot) {
	return Array.from(new Set(snapshot._nodes.flatMap((sn) => sn.ownEvents)));
}


export var pipeTo = fromPromise(({ input: { source, target, options } }) =>
	source.pipeTo(target, options)
);


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
