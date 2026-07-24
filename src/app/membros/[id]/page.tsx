import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MedalBadge } from "@/features/clan/components/medal-badge";
import { PlayerStats } from "@/features/clan/components/player-stats";
import { CLASS_LABEL, PLATFORM_LABEL } from "@/features/clan/lib/format";
import { getMemberProfile } from "@/features/clan/lib/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const member = await getMemberProfile(id);
  return { title: member ? member.nickname : "Membro" };
}

function initials(nickname: string): string {
  return (
    nickname
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

// joinedAt is a date-only (@db.Date) column; format in UTC to avoid off-by-one.
function formatJoinedDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default async function MemberProfilePage({ params }: Params) {
  const { id } = await params;
  const member = await getMemberProfile(id);
  if (!member) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <Link
        href="/membros"
        className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Membros
      </Link>

      {/* Header — background reflects the member's best class */}
      <header className="relative overflow-hidden rounded-xl border">
        {member.bestClass ? (
          <>
            <Image
              src={`/images/classes/${member.bestClass}.avif`}
              alt=""
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover object-top"
            />
            <div className="from-background via-background/85 to-background/40 absolute inset-0 bg-gradient-to-r" />
          </>
        ) : null}

        <div className="relative z-10 flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:p-8 sm:text-left">
          <Avatar className="border-primary/50 size-24 rounded-xl border-2 sm:size-28">
            <AvatarImage
              src={member.avatarUrl ?? "/member-default.png"}
              alt={member.nickname}
            />
            <AvatarFallback className="font-heading rounded-none text-2xl">
              {initials(member.nickname)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            <h1 className="font-heading text-3xl font-bold drop-shadow-sm sm:text-4xl">
              {member.nickname}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Badge>{PLATFORM_LABEL[member.platform]}</Badge>
              {member.joinedAt ? (
                <span className="text-muted-foreground text-sm">
                  Entrou em {formatJoinedDate(member.joinedAt)}
                </span>
              ) : null}
            </div>
          </div>

          {member.bestClass ? (
            <div className="bg-secondary/70 flex flex-col items-center gap-1.5 rounded-lg p-4 backdrop-blur">
              <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
                Melhor classe
              </span>
              <Image
                src={`/icons/${member.bestClass}.svg`}
                alt={CLASS_LABEL[member.bestClass]}
                width={80}
                height={80}
                unoptimized
                className="size-16 object-contain"
              />
              <span className="font-heading text-lg font-semibold">
                {CLASS_LABEL[member.bestClass]}
              </span>
            </div>
          ) : null}
        </div>
      </header>

      {/* Stats */}
      <section className="mt-10">
        <h2 className="font-heading mb-4 text-xl font-semibold">Estatísticas</h2>
        <PlayerStats stats={member.totals} bestClass={member.bestClass} />
      </section>

      {/* Medals */}
      <section className="mt-10">
        <h2 className="font-heading mb-4 text-xl font-semibold">
          Medalhas{" "}
          <span className="text-muted-foreground font-sans text-base font-normal">
            ({member.medalCount})
          </span>
        </h2>
        {member.medals.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            Nenhuma medalha conquistada ainda.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {member.medals.map((medal) => (
              <div key={medal.id} className="rounded-lg border p-4">
                <MedalBadge
                  name={medal.name}
                  tier={medal.tier}
                  icon={medal.icon}
                />
                {medal.criteria ? (
                  <p className="text-muted-foreground mt-2 text-sm">
                    {medal.criteria}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
