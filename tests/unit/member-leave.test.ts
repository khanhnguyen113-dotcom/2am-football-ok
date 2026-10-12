import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RsvpBoard } from "@/components/match-bits";
import type { PubMember } from "@/lib/domain";

const member = (id: string, status: string): PubMember => ({
  id, full_name: id, nickname: null, avatar_path: null, shirt_number: null,
  preferred_foot: "right", joined_on: "2026-01-01", left_on: null, status,
  version: 1, fee_type: "standard", primary_position: "MID", positions: ["MID"],
});

describe("temporary member leave", () => {
  it("excludes paused members from required votes and unanswered rows", () => {
    const html = renderToStaticMarkup(createElement(RsvpBoard, {
      members: [member("Đang đá", "active"), member("Xin nghỉ", "paused"), member("Đã rời đội", "left")],
      rsvps: [],
    }));
    expect(html).toContain('Cần vote: <b class="text-fg">1</b>');
    expect(html).toContain("Nghỉ tạm (1) · miễn vote");
    expect(html).toContain("Xin nghỉ");
    expect(html.match(/Chưa phản hồi/g)).toHaveLength(1);
    expect(html).not.toContain("Đã rời đội");
  });

  it("includes the member again when the admin restores active status", () => {
    const html = renderToStaticMarkup(createElement(RsvpBoard, {
      members: [member("Đang đá", "active"), member("Hết nghỉ", "active")], rsvps: [],
    }));
    expect(html).toContain('Cần vote: <b class="text-fg">2</b>');
    expect(html.match(/Chưa phản hồi/g)).toHaveLength(2);
    expect(html).not.toContain("miễn vote");
  });
});
