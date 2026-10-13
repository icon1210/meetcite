import { describe, expect, it } from "vitest";
import { applyTurn, type CaptionTurn } from "@/lib/useLiveCaptions";

describe("applyTurn", () => {
  it("updates a turn in place until it ends, then keeps the formatted version", () => {
    let turns: CaptionTurn[] = [];
    turns = applyTurn(turns, { turn_order: 0, transcript: "we agreed", end_of_turn: false });
    turns = applyTurn(turns, { turn_order: 0, transcript: "we agreed to launch", end_of_turn: false });
    expect(turns).toEqual([{ order: 0, text: "we agreed to launch", final: false }]);

    // The unformatted end-of-turn message is still provisional; the formatted one is final.
    turns = applyTurn(turns, {
      turn_order: 0,
      transcript: "we agreed to launch",
      end_of_turn: true,
      turn_is_formatted: false,
    });
    expect(turns[0].final).toBe(false);
    turns = applyTurn(turns, {
      turn_order: 0,
      transcript: "We agreed to launch.",
      end_of_turn: true,
      turn_is_formatted: true,
    });
    expect(turns).toEqual([{ order: 0, text: "We agreed to launch.", final: true }]);
  });

  it("keeps turns in speaking order and ignores empty messages", () => {
    let turns: CaptionTurn[] = [];
    turns = applyTurn(turns, { turn_order: 1, transcript: "second", end_of_turn: false });
    turns = applyTurn(turns, { turn_order: 0, transcript: "first", end_of_turn: true, turn_is_formatted: true });
    turns = applyTurn(turns, { turn_order: 2, transcript: "", end_of_turn: false });
    expect(turns.map((t) => t.text)).toEqual(["first", "second"]);
  });
});
