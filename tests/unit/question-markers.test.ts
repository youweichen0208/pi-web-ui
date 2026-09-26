import { expect, test } from "vitest";
import { clusterQuestionMarkers } from "../../web/src/question-markers.js";

test("nearby question marks become one visible rail mark without losing navigation members", () => {
	const groups = clusterQuestionMarkers([
		{ id: "a", position: 0.10 },
		{ id: "b", position: 0.11 },
		{ id: "c", position: 0.50 },
	], 1000);
	expect(groups.map((group) => group.ids)).toEqual([["a", "b"], ["c"]]);
	expect(groups[0].position).toBeCloseTo(0.105);
	expect(groups[1].position).toBe(0.50);
	expect(clusterQuestionMarkers([{ id: "a", position: 0.1 }, { id: "b", position: 0.125 }], 1000)).toHaveLength(1);
});
