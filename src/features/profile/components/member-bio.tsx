"use client";

// The bio, in place on the member's own profile page.
//
// EDITED WHERE IT IS READ (clan owner's decision, 2026-07-29), instead of on a
// separate settings route. The member clicks their own bio and it becomes a field.
// That removes the step where someone has to know a second URL exists, which is what
// kills self-service features in a clan where most people arrive from a Discord link.
//
// `canEdit` only decides what is RENDERED. The boundary is the action: it takes the
// member from the session (`requireOwnMemberId`) and never from a prop, so a forged
// request cannot aim this at anyone else's row. See ../lib/actions.ts.
//
// WHY useTransition AND NOT useActionState. The editor has to close when a save lands
// and stay open when one is rejected. With `useActionState` that would be a
// `setState` inside an effect, which this project's ESLint refuses
// (`react-hooks/set-state-in-effect`) and which reads as a reaction to a state change
// rather than to the event that caused it. Awaiting the action inside the transition
// puts the decision at the point of the save.
//
// THE DASHED BORDER IS THE AFFORDANCE. Full width, transparent at rest, dashed and
// visible on hover. It is drawn at rest too (in `border-transparent`) rather than
// added on hover, so hovering changes a colour and never the layout: a border that
// appears from nothing shifts the text by a pixel and the whole row twitches.
//
// SIZED NOT TO GROW THE HEADER, which is the constraint the design answers to (clan
// owner, 2026-07-29). What makes it possible is the rank/class cards beside it: they
// are 153 px tall and FIXED, so they set the header's height and the middle column
// holding the nickname, the platform row and this bio has slack underneath them.
//
// Measured at 1280 px on a real profile, 2026-07-29. The bio column is 526 px wide
// there, which is the number the rest of this depends on:
//
//   state                     middle column   header
//   no bio                            76 px    219 px
//   reading, 280 characters          146 px    219 px
//   reading, 10 line breaks          146 px    219 px
//   editing, 280 characters          124 px    219 px
//   editing, with an error           148 px    219 px
//
// The header holds at 219 px in every state, with 153 px of cards setting it.
//
// THREE THINGS ARE LOAD-BEARING, and the numbers above are why:
//
//   - **`line-clamp-3`.** At `text-sm` in 526 px, 280 characters wrap to four lines,
//     and four lines measured 166 px of middle column, which pushed the header to
//     232 px. Three lines land at 146 px and hold. The clamp is also the only guard
//     for a short bio made of many line breaks: 10 breaks measured 286 px unclamped.
//     Roughly 255 of the 280 characters are visible at three lines, and clicking
//     through to the field shows all of it.
//   - **`text-sm`, not larger.** The bump from `text-xs` cost 13 px of header on its
//     own until the clamp absorbed it. There is no room left for another step up.
//   - **The buttons BESIDE the field, in a row.** At 32 px they are shorter than the
//     48 px field, so they add no height. In a row underneath they would.
//
// Re-measure before touching the font size, the clamp, or the button layout. The
// harness has one trap worth knowing: Tailwind v4 only emits classes it finds in the
// source, so testing a clamp value that is not already in this file measures no clamp
// at all rather than the value asked for.

import { Check, SquarePen, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { updateBioAction } from "../lib/actions";
import { BIO_MAX_LENGTH } from "../lib/schemas";

interface MemberBioProps {
  bio: string | null;
  /** Whether the viewer is this member. Display only, never authorization. */
  canEdit: boolean;
}

export function MemberBio({ bio, canEdit }: MemberBioProps) {
  /**
   * The bio on screen. Seeded from the server render and owned by the client after a
   * save, which is safe here for a reason specific to this field: the only person who
   * can change it is the one looking at it, so their copy cannot go stale behind
   * their back.
   */
  const [savedBio, setSavedBio] = useState(bio);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bio ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setDraft(savedBio ?? "");
    setError(null);
    setEditing(true);
  }

  function save(formData: FormData) {
    startTransition(async () => {
      const result = await updateBioAction(null, formData);
      if (!result.ok) {
        // The field error is the specific one, so it wins when both are present.
        // It is also the ONLY place the "no links" rule is stated now that the hint
        // under the field is gone, so it cannot be dropped for tidiness.
        setError(result.fieldErrors?.bio?.[0] ?? result.error);
        return;
      }
      setSavedBio(result.data.bio);
      setError(null);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <form action={save} className="w-full">
        <div className="flex w-full items-start gap-2">
          <Textarea
            name="bio"
            autoFocus
            /**
             * Silent cap. The counter that used to explain it was dropped for size,
             * so the field just stops accepting input. The server checks the same
             * length regardless: this is comfort, not the rule.
             */
            maxLength={BIO_MAX_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreva sua bio"
            aria-label="Sua bio"
            aria-invalid={error ? true : undefined}
            /**
             * `field-sizing-fixed` and `resize-none` together are what hold the header
             * still: the shadcn default is `field-sizing-content`, which grows the
             * field with the text and would push the band open as the member types.
             * Anything past 48 px scrolls instead.
             */
            className="bg-background/80 field-sizing-fixed h-12 min-h-0 flex-1 resize-none px-2 py-1 text-sm leading-snug backdrop-blur-sm md:text-sm"
          />

          {/* In a row beside the field, not under it: 32 px is shorter than the 48 px
              field, so these cost no height. */}
          <div className="flex shrink-0 gap-1">
            <Button
              type="submit"
              size="icon-sm"
              variant="outline"
              disabled={pending}
              aria-label="Salvar"
            >
              <Check />
            </Button>
            {/* Not a submit, so it cannot post the draft it is discarding. */}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              aria-label="Cancelar"
            >
              <X />
            </Button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-destructive mt-1 text-sm">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  // Someone else's profile: the bio is text, and an empty one is simply absent. No
  // "sem bio ainda" placeholder, because it would announce a hole in a page that
  // reads fine without it, and it is not a hole the visitor can fill.
  //
  // Padded to match the editable version so the text sits in the same place on both,
  // and so a visitor's view lines up with the owner's.
  if (!canEdit) {
    return savedBio ? (
      <p
        title={savedBio}
        className="text-muted-foreground line-clamp-3 w-full px-2 py-1 text-sm whitespace-pre-line"
      >
        {savedBio}
      </p>
    ) : null;
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      // The bio text is inside the button, so without this the accessible name would
      // be the bio itself and the action would go unannounced.
      aria-label={savedBio ? "Editar sua bio" : "Adicionar uma bio"}
      className="group hover:border-muted-foreground/40 flex w-full cursor-pointer items-start gap-1.5 rounded-md border border-dashed border-transparent px-2 py-1 text-left transition-colors"
    >
      {savedBio ? (
        <span title={savedBio} className="line-clamp-3 text-sm whitespace-pre-line">
          {savedBio}
        </span>
      ) : (
        // The empty state exists only for the owner, and it is the whole discovery
        // mechanism: nobody clicks a bio that is not there.
        <span className="text-muted-foreground text-sm">Adicione uma bio</span>
      )}
      <SquarePen
        aria-hidden
        className="text-muted-foreground mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}
