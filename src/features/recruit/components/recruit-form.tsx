"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { submitRecruitAction } from "../lib/actions";
import { AGE_BRACKETS, RECRUIT_PLATFORMS, REFERRAL_OPTIONS } from "../lib/schemas";
import { formatWhatsapp } from "../lib/whatsapp";

/** Radio group rendered as buttons, so the options are one tap on a phone. */
function ChoiceGroup({
  name,
  legend,
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  legend: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
  error?: string;
}) {
  return (
    <fieldset>
      {/* A real fieldset/legend, not a <p>: it is what makes a screen reader announce
          the question before each option instead of reading five orphan labels. */}
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/15 text-foreground font-medium"
                  : "border-input hover:border-muted-foreground/40 text-muted-foreground",
              )}
            >
              {/* The input is visually hidden rather than removed, so keyboard focus and
                  the native radio semantics survive. */}
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-destructive mt-1.5 text-xs">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The clan's recruitment form, rebuilt from the Google Form it replaces.
 *
 * SAME QUESTIONS, SAME WORDING, so the answers stay comparable with the spreadsheet
 * that already holds years of them — plus the two the form never asked and the system
 * genuinely needs: the EA display name and the Discord handle.
 *
 * The EA name is the one that matters. Until now it was typed by an ADMIN guessing at
 * someone else's account, and that guess is the origin of the project's most expensive
 * defect: 23 of 99 members carrying an id that matches no EA account, and ten of them
 * briefly wearing a stranger's career. Asking the person who knows is the whole point of
 * this page existing instead of a link to Google.
 */
export function RecruitForm() {
  const [state, setState] = useState<
    { status: "idle" | "sent" } | { status: "error"; message: string }
  >({ status: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  /**
   * EVERY FIELD IS CONTROLLED, and that is what keeps the answers on screen when the
   * server rejects one of them.
   *
   * React resets an uncontrolled form once a form action resolves, so the first version of
   * this page cleared seven questions to complain about one — which is the fastest way to
   * make somebody give up on joining. Held in state, a rejection only ever ADDS a message.
   */
  const [values, setValues] = useState({
    realName: "",
    whatsapp: "",
    nickname: "",
    declaredEaName: "",
    discordHandle: "",
    platform: "",
    ageBracket: "",
    hasGame: "",
    referralChoice: "",
    referralOther: "",
  });

  function set<K extends keyof typeof values>(field: K) {
    return (next: string) => setValues((current) => ({ ...current, [field]: next }));
  }

  // Stamped in an effect rather than in the initializer, because a value read during
  // render has to be pure — and the effect is also the honest moment: it is when the form
  // actually reached a person.
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  /**
   * `onSubmit` WITH `preventDefault`, NOT `action={submit}`, and that is what actually
   * keeps the answers on screen.
   *
   * React resets the form when a function passed to `action` resolves. Controlling every
   * field is not enough to survive it: the text values came back, but a radio's DOM
   * `checked` did not, because React only re-applies a prop that CHANGED and the state
   * behind it had not — so the reset won and the platform and age silently lost their
   * selection while the text answers stayed. Rejecting one field would have cleared two
   * others, which is worse than clearing all of them because nobody notices.
   *
   * Native validation still runs first: the browser blocks submit on a missing `required`
   * field before this is called, and that path never resets anything.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(new FormData(event.currentTarget));
  }

  function submit(formData: FormData) {
    // The elapsed time the action uses to tell a person reading the questions from a
    // script that posts the moment it finds the form. Safe to read the clock here:
    // `submit` is a form action, so it runs on submit and never during render.
    formData.set("elapsedSeconds", String((Date.now() - mountedAt.current) / 1000));
    startTransition(async () => {
      const result = await submitRecruitAction(null, formData);
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setState({ status: "error", message: result.error });
        return;
      }
      setFieldErrors({});
      setState({ status: "sent" });
    });
  }

  if (state.status === "sent") {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-400" aria-hidden />
        <h2 className="font-heading mt-3 text-xl font-bold">Candidatura enviada</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Um admin do clã vai olhar e falar com você pelo WhatsApp. Não precisa enviar de novo.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">Voltar para o site</Link>
        </Button>
      </div>
    );
  }

  const err = (field: string) => fieldErrors[field]?.[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* HONEYPOT. Hidden from people and from screen readers, left in the DOM for the
          scripts that fill every input they find. `sr-only` would still be announced,
          so this one is genuinely removed from the accessibility tree. */}
      <div aria-hidden className="hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <ChoiceGroup
        name="hasGame"
        legend="Você tem o jogo comprado?"
        options={[
          { value: "sim", label: "Sim" },
          { value: "nao", label: "Não, só vou jogar BattleRoyale neste momento" },
        ]}
        value={values.hasGame}
        onChange={set("hasGame")}
        error={err("hasGame")}
      />

      <Field id="realName" label="Qual seu nome?" error={err("realName")}>
        <Input
          id="realName"
          name="realName"
          autoComplete="name"
          value={values.realName}
          onChange={(event) => set("realName")(event.target.value)}
          required
        />
      </Field>

      <Field
        id="whatsapp"
        label="Qual seu WhatsApp?"
        hint="Com DDD. É por aí que a gente responde."
        error={err("whatsapp")}
      >
        <Input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 99999-9999"
          value={values.whatsapp}
          // Masked on every keystroke, so the field reads as a phone number from the third
          // digit on instead of rearranging itself on blur.
          onChange={(event) => set("whatsapp")(formatWhatsapp(event.target.value))}
          required
        />
      </Field>

      <Field id="nickname" label="Qual seu nick no jogo?" error={err("nickname")}>
        <Input
          id="nickname"
          name="nickname"
          autoComplete="off"
          value={values.nickname}
          onChange={(event) => set("nickname")(event.target.value)}
          required
        />
      </Field>

      <ChoiceGroup
        name="platform"
        legend="Qual a sua plataforma?"
        options={RECRUIT_PLATFORMS}
        value={values.platform}
        onChange={set("platform")}
        error={err("platform")}
      />

      <ChoiceGroup
        name="ageBracket"
        legend="Quantos anos você tem?"
        options={AGE_BRACKETS}
        value={values.ageBracket}
        onChange={set("ageBracket")}
        error={err("ageBracket")}
      />

      {/* The two questions the Google Form never asked. Grouped and explained, because
          they are the ones a candidate will not understand the reason for. */}
      <div className="border-primary/30 bg-primary/5 space-y-4 rounded-md border p-4">
        <Field
          id="declaredEaName"
          label="Qual seu nome de exibição da EA?"
          hint="É o que liga você aos seus stats de Battlefield 6. Escreva EXATAMENTE como está na sua conta da EA, com tag, número, símbolo e acento se tiver: a busca compara o nome inteiro, e um caractere diferente não encontra."
          error={err("declaredEaName")}
        >
          <Input
            id="declaredEaName"
            name="declaredEaName"
            autoComplete="off"
            value={values.declaredEaName}
            onChange={(event) => set("declaredEaName")(event.target.value)}
            required
          />
        </Field>

        <Field
          id="discordHandle"
          label="Qual seu usuário do Discord?"
          hint="Opcional. O clã se organiza pelo Discord, e é por lá que seu acesso ao site é liberado."
          error={err("discordHandle")}
        >
          <Input
            id="discordHandle"
            name="discordHandle"
            autoComplete="off"
            value={values.discordHandle}
            onChange={(event) => set("discordHandle")(event.target.value)}
          />
        </Field>
      </div>

      <ChoiceGroup
        name="referralChoice"
        legend="Como ficou sabendo do F4F?"
        options={REFERRAL_OPTIONS.map((option) => ({ value: option, label: option }))}
        value={values.referralChoice}
        onChange={set("referralChoice")}
        error={err("referral")}
      />
      {/* "Outro" opens a text field, exactly like the form it replaces. The real
          `referral` value is whatever ends up here, so the free text wins when present. */}
      <input
        type="hidden"
        name="referral"
        value={
          values.referralChoice === "Outro"
            ? values.referralOther || "Outro"
            : values.referralChoice
        }
      />
      {values.referralChoice === "Outro" ? (
        <Field id="referralOther" label="Onde, especificamente?">
          <Input
            id="referralOther"
            autoComplete="off"
            placeholder="Conta pra gente"
            value={values.referralOther}
            onChange={(event) => set("referralOther")(event.target.value)}
          />
        </Field>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="text-destructive text-sm">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Enviando..." : "Quero entrar no F4F"}
      </Button>
    </form>
  );
}
