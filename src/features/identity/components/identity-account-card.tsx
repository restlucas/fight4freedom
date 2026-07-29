// One EA account, rendered so a human can say "that's me" or "that's not me" in
// a couple of seconds.
//
// The field choice is about RECOGNITION, not completeness. A member does not
// remember their objective-defend count, but they know their rank, roughly how
// many hours they have, and which class they main — so those lead, and the rank
// insignia is shown as artwork because it is the thing they see every time the
// game loads.

import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { CLASS_LABEL, formatNumber } from "@/lib/format";
import type { IdentityCard } from "@/lib/stats/provider";
import { cn } from "@/lib/utils";

/** pt-BR date, for the one timestamp on the card. */
function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

type Field = { label: string; value: string; hint?: string };

/**
 * Only fields the source actually answered. A card that prints "0" for something
 * it does not know is worse than a shorter card: a member who really has zero
 * revives and a member whose payload lost the counter would read identically, and
 * one of them is about to reject their own account over it.
 */
function fieldsOf(card: IdentityCard, lastPlayedAt: Date | null): Field[] {
  const fields: Field[] = [];
  if (card.hoursPlayed != null) {
    fields.push({ label: "Horas jogadas", value: `${formatNumber(card.hoursPlayed)} h` });
  }
  if (card.kills != null) {
    fields.push({
      label: "Kills",
      value: formatNumber(card.kills),
      hint: "contra jogadores reais",
    });
  }
  if (card.matches != null) {
    fields.push({ label: "Partidas", value: formatNumber(card.matches) });
  }
  if (card.bestClass) {
    fields.push({
      label: "Classe mais jogada",
      value: CLASS_LABEL[card.bestClass],
      hint: "por tempo de jogo",
    });
  }
  if (card.badges != null) {
    fields.push({ label: "Insígnias", value: formatNumber(card.badges) });
  }
  if (card.dogTags != null) {
    fields.push({ label: "Dog tags", value: formatNumber(card.dogTags) });
  }
  if (lastPlayedAt) {
    fields.push({
      label: "Última partida vista",
      value: formatDay(lastPlayedAt),
      // Said plainly because it is OUR observation, not EA's. The EA payload has
      // no date field at all, so this only exists for accounts we already collect.
      hint: "registrada pelo site",
    });
  }
  return fields;
}

interface IdentityAccountCardProps {
  card: IdentityCard;
  /** From our own snapshots. Null for an account the site has never collected. */
  lastPlayedAt?: Date | null;
  /** Selected state, for when several candidates are on screen at once. */
  selected?: boolean;
  /** The confirm button (or anything else) the caller wants in the footer. */
  action?: React.ReactNode;
  className?: string;
}

export function IdentityAccountCard({
  card,
  lastPlayedAt = null,
  selected = false,
  action,
  className,
}: IdentityAccountCardProps) {
  const fields = fieldsOf(card, lastPlayedAt);

  return (
    <div
      className={cn(
        "bg-card rounded-xl border p-5 transition-colors",
        selected && "border-primary ring-primary/30 ring-2",
        card.empty && "border-destructive/50",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        {card.rankImageUrl ? (
          <Image
            src={card.rankImageUrl}
            alt={card.rankName ? `Patente ${card.rankName}` : "Patente"}
            width={56}
            height={56}
            className="size-14 shrink-0 object-contain"
            // The CDN is a third party on a screen someone is waiting on: a broken
            // image must cost nothing, so it is never part of the critical path.
            unoptimized
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-lg font-bold">
            {card.rankName ?? "Patente não informada"}
          </p>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {card.rankLevel != null ? <span>Nível {card.rankLevel}</span> : null}
            {card.identity.username ? (
              <>
                {card.rankLevel != null ? <span aria-hidden>·</span> : null}
                <span className="truncate">
                  username <strong className="text-foreground">{card.identity.username}</strong>
                </span>
              </>
            ) : null}
          </div>
        </div>

        {card.empty ? <Badge variant="destructive">Sem dados de BF6</Badge> : null}
      </div>

      {card.empty ? (
        <p className="text-destructive mt-4 text-sm">
          A EA não tem nenhum registro de Battlefield 6 nessa conta. Vincular ela deixaria seus
          stats zerados.
        </p>
      ) : fields.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fields.map((field) => (
            <div key={field.label} className="bg-muted/40 rounded-lg px-3 py-2">
              <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                {field.label}
              </dt>
              <dd className="font-heading mt-0.5 text-xl font-bold tabular-nums">{field.value}</dd>
              {field.hint ? (
                <p className="text-muted-foreground mt-0.5 text-[11px]">{field.hint}</p>
              ) : null}
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">
          A fonte não devolveu os números dessa conta agora. Você ainda pode confirmar pelo nome e
          pela patente, ou tentar de novo em alguns segundos.
        </p>
      )}

      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
