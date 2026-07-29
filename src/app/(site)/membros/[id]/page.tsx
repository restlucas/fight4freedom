import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { RefreshOnFocus } from "@/components/refresh-on-focus";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MemberMedals } from "@/features/clan/components/member-medals";
import { MemberProgression } from "@/features/clan/components/member-progression";
import { PlatformIcon } from "@/features/clan/components/platform-icon";
import { PlayerStats } from "@/features/clan/components/player-stats";
import { RankForecastPanel } from "@/features/clan/components/rank-forecast";
import { RankCard } from "@/features/clan/components/rank-card";
import { CLASS_LABEL, memberInitials } from "@/features/clan/lib/format";
import { getMemberProfile, getStatLeaders } from "@/features/clan/lib/queries";
import { STAT_KEYS, type StatKey } from "@/features/clan/lib/stat-keys";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const member = await getMemberProfile(id);
  return { title: member ? member.nickname : "Membro" };
}

// joinedAt is a date-only (@db.Date) column serialized as ISO by the data layer;
// format in UTC to avoid off-by-one.
function formatJoinedDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export default async function MemberProfilePage({ params }: Params) {
  const { id } = await params;
  const [member, leaders] = await Promise.all([getMemberProfile(id), getStatLeaders()]);
  if (!member) notFound();

  const leadsIn: StatKey[] = STAT_KEYS.filter((key) => leaders[key].includes(member.id));

  return (
    <>
      {/* Same reason as /ranking: stats, career points and the rank forecast all
          move with the collection, and none of them change on an open page. */}
      <RefreshOnFocus />
      {/* Page background */}
      {/* w-screen: see the same background in /membros — 100vw does not change when
          an overlay removes the scrollbar. */}
      <div aria-hidden className="fixed inset-y-0 left-0 -z-10 w-screen">
        <Image
          src="/bf6-season-4.avif"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="bg-background/40 absolute inset-0" />
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <Link
          href="/membros"
          className="bg-secondary/80 hover:text-primary mb-6 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium backdrop-blur-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          Membros
        </Link>

        {/* Header — background reflects the member's best class, falling back to
            the app's default art so a member with no snapshot yet does not get an
            empty band. */}
        <header className="relative overflow-hidden rounded-xl border">
          <Image
            src={member.bestClass ? `/images/classes/${member.bestClass}.avif` : "/background.avif"}
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-cover object-top"
          />
          <div className="from-background via-background/85 to-background/40 absolute inset-0 bg-gradient-to-r" />

          <div className="relative z-10 flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:p-8 sm:text-left">
            <Avatar className="border-primary/50 size-24 rounded-xl border-2 sm:size-28">
              <AvatarImage src={member.avatarUrl ?? "/member-default.png"} alt={member.nickname} />
              <AvatarFallback className="font-heading rounded-none text-2xl">
                {memberInitials(member.nickname)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-2">
              <h1 className="font-heading text-3xl font-bold drop-shadow-sm sm:text-4xl">
                {member.nickname}
              </h1>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <PlatformIcon platform={member.platform} platformId={member.platformId} />
                {member.joinedAt ? (
                  <span className="text-muted-foreground text-sm">
                    Entrou em {formatJoinedDate(member.joinedAt)}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Side by side at every width — on mobile they used to stack and
                eat the whole screen. */}
            <div className="flex items-center gap-3">
              {member.bestClass ? (
                <div className="bg-secondary/70 flex h-[153px] w-[118px] flex-col items-center justify-between gap-1.5 rounded-lg p-4 backdrop-blur">
                  {/* nowrap at 10px: wrapping to two lines overflowed the fixed
                      height, and the flex squeeze pushed the name below the
                      rank card's. */}
                  <span className="text-muted-foreground text-[10px] tracking-wide whitespace-nowrap uppercase">
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
                  {/* Fixed-height box with the text centred: the rank name
                      beside it uses a smaller font, and matching font metrics is
                      the only way to make the two labels look aligned. */}
                  <span className="font-heading flex h-7 items-center text-lg/[1] font-semibold">
                    {CLASS_LABEL[member.bestClass]}
                  </span>
                </div>
              ) : null}

              <RankCard points={member.rankPoints} />
            </div>
          </div>
        </header>

        {/* Stats */}
        <section className="mt-10">
          <h2 className="font-heading mb-4 text-xl font-semibold">Estatísticas</h2>
          <PlayerStats
            stats={member.totals}
            bestClass={member.bestClass}
            headshotRate={member.headshotRate}
            leadsIn={leadsIn}
          />
        </section>

        {/* Progression */}
        <section className="mt-10">
          <h2 className="font-heading mb-4 text-xl font-semibold">Progressão</h2>
          <RankForecastPanel
            points={member.rankPoints}
            series={member.progression}
            className="mb-3"
          />
          {member.progression.length >= 2 ? (
            /* Opaque enough to be a chart SURFACE: the page background is a
               photograph, and a 40 % panel let it read through the plot area. */
            <div className="bg-secondary/70 rounded-xl border p-4 backdrop-blur-sm sm:p-5">
              <MemberProgression series={member.progression} />
            </div>
          ) : (
            /* Two readings are the minimum for a line to exist at all, and today
               most of the roster is below that: collection started on 27/07. The
               copy says so plainly instead of showing an empty frame that reads as
               a bug — the same mistake the "Aguardando 1ª leitura" label fixed in
               the panel. */
            <div className="bg-secondary/40 text-muted-foreground rounded-xl border p-6 text-sm backdrop-blur-sm">
              <p className="text-foreground font-medium">Sem histórico suficiente ainda</p>
              <p className="mt-1">
                O gráfico aparece a partir da segunda leitura de stats.{" "}
                {member.progression.length === 1
                  ? "Este membro tem uma leitura até agora."
                  : "Este membro ainda não tem nenhuma leitura."}{" "}
                A coleta roda a cada 20 minutos e só registra uma leitura nova quando o membro joga.
              </p>
            </div>
          )}
        </section>

        {/* Medals */}
        <section className="mt-10">
          <h2 className="font-heading mb-4 text-xl font-semibold">
            Medalhas{" "}
            <span className="text-muted-foreground font-sans text-base font-normal">
              ({member.medalCount})
            </span>
          </h2>
          <MemberMedals medals={member.medals} />
        </section>
      </main>
    </>
  );
}
