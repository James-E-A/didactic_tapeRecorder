const TZLETTER = new Map([
	[0, "Z"],
	[60, "N"],
	[120, "O"],
	[180, "P"],
	[240, "Q"],
	[300, "R"],
	[360, "S"],
	[420, "T"],
	[480, "U"],
	[540, "V"],
	[600, "W"],
	[660, "X"],
	[720, "Y"],
	[-720, "M"],
	[-660, "L"],
	[-600, "K"],
	[-540, "I"],
	[-480, "H"],
	[-420, "G"],
	[-360, "F"],
	[-300, "E"],
	[-240, "D"],
	[-180, "C"],
	[-120, "B"],
	[-60, "A"],
]);

TZLETTER.default = "J";


export function filenameSafeTimestamp(d, useLocalTime=true) {
	if (d === undefined)
		d = new Date();

	return (
		useLocalTime
		? `${d.getFullYear().toString().padStart(4, "0")}-${(d.getMonth()+1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}T${d.getHours().toString().padStart(2, "0")}-${d.getMinutes().toString().padStart(2, "0")}-${d.getSeconds().toString().padStart(2, "0")}${TZLETTER.get(d.getTimezoneOffset()) ?? TZLETTER.default}`
		: `${d.getUTCFullYear().toString().padStart(4, "0")}-${(d.getUTCMonth()+1).toString().padStart(2, "0")}-${d.getUTCDate().toString().padStart(2, "0")}T${d.getUTCHours().toString().padStart(2, "0")}-${d.getUTCMinutes().toString().padStart(2, "0")}-${d.getUTCSeconds().toString().padStart(2, "0")}${TZLETTER.get(0)}`
	);
}
