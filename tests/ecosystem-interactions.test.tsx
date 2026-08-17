// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EcosystemCenter } from "../src/components/EcosystemCenter";
import { Home } from "../src/components/Home";
afterEach(cleanup);
describe("ecosystem interfaces",()=>{
  it("opens from Home",async()=>{const user=userEvent.setup();render(<Home onOpen={vi.fn()}/>);await user.click(screen.getByRole("button",{name:/extend & about/i}));expect(await screen.findByRole("dialog",{name:/extensions & diagnostics/i})).toBeTruthy();expect(screen.getByText(/declarative plugin sdk v1/i)).toBeTruthy()});
  it("shows theme safety, model verification, privacy, and update status",async()=>{const user=userEvent.setup();render(<EcosystemCenter onClose={vi.fn()}/>);await user.click(screen.getByRole("button",{name:/themes/i}));expect(screen.getByText(/validated openframe color tokens/i)).toBeTruthy();await user.click(screen.getByRole("button",{name:/ai extensions/i}));expect(screen.getByText(/explicit verified downloads/i)).toBeTruthy();await user.click(screen.getByRole("button",{name:/about/i}));expect(await screen.findByText(/no signed update channel/i)).toBeTruthy();expect(screen.getByText(/diagnostics exclude project names/i)).toBeTruthy()});
});
