import { createActor } from 'xstate';

import { getNextEvents } from './xstate_helpers.mjs'
import tapeRecorder from './tapeRecorder.mjs';

var actor = window.temp0 = createActor(tapeRecorder);

{
	let form = document.createElement('form');
	form.action = 'javascript:';

	let controls = document.createElement('p');
	form.appendChild(controls);

	let record = document.createElement('button');
	record.textContent = record.value = 'record';
	record.dataset.allowedInStates = "inactive";
	controls.appendChild(record);

	let resume = document.createElement('button');
	resume.textContent = resume.value = 'resume';
	resume.dataset.allowedInStates = "recording.recording.paused";
	controls.appendChild(resume);

	let pause = document.createElement('button');
	pause.textContent = pause.value = 'pause';
	pause.dataset.allowedInStates = "recording.recording.recording";
	controls.appendChild(pause);

	let stop = document.createElement('button');
	stop.textContent = stop.value = 'stop';
	stop.dataset.allowedInStates = "recording";
	controls.appendChild(stop);

	let mimeType = document.createElement('select');
	mimeType.hidden = true;
	mimeType.name = 'mimeType';
	mimeType.add(new Option('audio/webm;codecs=opus'));
	mimeType.dataset.allowedInStates = "inactive";
	form.appendChild(mimeType);

	let suggestedName = document.createElement('input');
	suggestedName.type = 'hidden';
	suggestedName.name = 'suggestedName';
	suggestedName.value = 'out.weba';
	form.appendChild(suggestedName);

	document.body.appendChild(form);
	record.focus();

	actor.subscribe((snapshot) => {
		console.debug(
			"%s: %s",
			JSON.stringify(snapshot.value),
			JSON.stringify(getNextEvents(snapshot))
		);
		for (let e of form.elements) {
			e.disabled = !arrayIntersects(
				matchingStates(snapshot.value).concat(["_any"]),
				e.dataset.allowedInStates?.split(" ") ?? ["_any"]
			);
		}
	});

	actor.start();
	for await (
		let { submitter: { value: action }, target }
		of eventsDebounced(form, 'submit')
	) {
		let input = Object.fromEntries(new FormData(target));
		actor.send({
			type: `action_${action}`,
			input,
		});
	}
}


function matchingStates(value) {
	return Array.from(_matchingStates(value, []));
}


function* _matchingStates(value, prefix) {
	if (prefix.length > 0)
		yield prefix.join(".");

	if (typeof value === "string") {
		yield prefix.concat([value]).join(".");
	} else if (value instanceof Object) {
		for (let [key, value_] of Object.entries(value)) {
			yield* _matchingStates(value_, prefix.concat([key]));
		}
	} else {
		throw new TypeError("each node must be a string or an object");
	}
}


async function* eventsDebounced(target, eventType) {
	while (true) {
		yield await new Promise((resolve) => {
			target.addEventListener(eventType, resolve, { once: true });
		});
	}
}

function arrayIntersects(a, b) {
	if (a.length > b.length)
		return arrayIntersects(b, a);

	return a.some((x) => b.includes(x));
}
