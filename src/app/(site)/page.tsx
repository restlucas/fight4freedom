import { Crosshair, Shield, Trophy, Users, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VideoBackground } from "@/components/video-background";
import { JoinChannels } from "@/features/clan/components/join-channels";
import { MedalsCarousel } from "@/features/clan/components/medals-carousel";
import { formatKd, formatNumber, formatPercent } from "@/features/clan/lib/format";
import { getClanStats, getMedalsCatalog } from "@/features/clan/lib/queries";
import { FORM_URL } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [stats, medals] = await Promise.all([getClanStats(), getMedalsCatalog()]);

  return (
    <>
      {/* Hero — looping in-game footage, muted and decorative. The poster below
          is also the fallback for reduced-motion users (see VideoBackground). */}
      {/* Full viewport minus the 4rem sticky header, so the hero fills the first
          screen exactly instead of pushing the page 4rem past it. dvh (not vh)
          so mobile browser chrome does not cut it off. */}
      <section className="bg-background relative flex min-h-[calc(100dvh-4rem)] w-full overflow-hidden">
        {/* The media fades out through a MASK instead of being covered by a
            gradient. A gradient painted over the flat page background gets
            dithered by the browser (pixels alternating by 1/255) and that noise
            stopped dead at the section edge, which reads as a line under the
            hero. Masking fades the footage itself, so the bottom of the section
            is plain background with nothing painted over it. */}
        <div
          aria-hidden
          className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black,black_55%,transparent_92%)] [-webkit-mask-image:linear-gradient(to_bottom,black,black_55%,transparent_92%)]"
        >
          <Image
            src="/background.avif"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <VideoBackground src="/bf6-season-4-ingame.webm" poster="/background.avif" />
          {/* Flat scrim for text contrast, INSIDE the mask so it fades out with
              the footage. Left outside, it also tinted the empty bottom of the
              section and the rounding of that blend against the plain page
              background produced a visible step. */}
          <div aria-hidden className="bg-background/45 absolute inset-0" />
        </div>
        <div className="relative z-10 mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
          <h1 className="sr-only">Fight 4 Freedom</h1>
          <p className="font-heading text-4xl font-bold tracking-tight sm:text-6xl">
            BEM-VINDO AO <span className="text-primary">F4F</span>
          </p>
          <p className="mt-6 max-w-2xl text-lg text-pretty sm:text-xl">
            Somos uma comunidade de jogadores dedicados que buscam excelência no campo de batalha.
            Valorizamos trabalho em equipe, comunicação estratégica e evolução constante — mas,
            acima de tudo, diversão.
          </p>
          <Button asChild size="lg" className="mt-8">
            <a href={FORM_URL} target="_blank" rel="noreferrer">
              Quero ser membro
            </a>
          </Button>
        </div>
      </section>

      {/* About the squad */}
      <section className="w-full py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-14 max-w-3xl text-center">
            <Image
              src="/f4f-logo.avif"
              alt="Fight 4 Freedom"
              width={273}
              height={271}
              className="mx-auto h-40 w-auto drop-shadow-lg sm:h-52"
            />
            <p className="mt-6 text-lg leading-relaxed">
              O clã <strong>[F4F] Fight 4 Freedom</strong> nasceu para construir uma comunidade
              sólida e acolhedora para todos os jogadores apaixonados por Battlefield — e, quem
              sabe, por outros jogos no futuro.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard
              icon={<Shield className="text-primary size-6" />}
              title="Comunidade"
              description="Jogadores de todos os níveis, dos iniciantes aos veteranos. Todos são bem-vindos para contribuir e se divertir."
            />
            <FeatureCard
              icon={<Users className="text-primary size-6" />}
              title="Jogadores"
              description="Gente dedicada e presente no dia a dia para treinos, ranqueadas e partidas casuais. Amizades que vão além do jogo."
            />
            <FeatureCard
              icon={<Trophy className="text-primary size-6" />}
              title="Competitivo"
              description="Participamos de torneios e competições, sempre buscando os primeiros lugares e representando o clã com honra."
            />
          </div>
        </div>
      </section>

      {/* Medals system */}
      <section className="relative w-full overflow-hidden py-20 md:py-24">
        <Image
          src="/images/battlefield-bg-3.avif"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="bg-background/50 absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="font-heading text-3xl font-bold md:text-5xl">
              SISTEMA DE <span className="text-primary">MEDALHAS</span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed">
              Reconhecemos o esforço de cada soldado com medalhas curadas pela equipe, organizadas
              por tiers de prestígio.
            </p>
          </div>

          <MedalsCarousel medals={medals} />

          <div className="mt-12 text-center">
            <Button asChild size="lg" variant="outline">
              <Link href="/medalhas">Ver todas as medalhas</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Join us */}
      <section className="w-full py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="font-heading text-3xl font-bold md:text-5xl">
              JUNTE-SE A <span className="text-primary">NÓS</span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed">
              Estamos sempre recrutando para fortalecer a comunidade. Fale com a gente pelos canais
              oficiais e comece sua jornada conosco.
            </p>
          </div>
          <JoinChannels />
        </div>
      </section>

      {/* Stats */}
      <section className="relative w-full overflow-hidden py-20 md:py-24">
        <Image
          src="/images/battlefield-bg-4.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="bg-background/50 absolute inset-0" />
        <div className="relative mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
          <StatCounter
            icon={<Users className="size-8 text-green-500" />}
            value={formatNumber(stats.totalMembers)}
            label="Membros ativos"
          />
          <StatCounter
            icon={<Trophy className="size-8 text-yellow-500" />}
            value={formatNumber(stats.totalMedalsAwarded)}
            label="Medalhas concedidas"
          />
          <StatCounter
            icon={<Crosshair className="size-8 text-red-500" />}
            value={formatKd(stats.averageKd)}
            label="K/D médio do clã"
          />
          <StatCounter
            icon={<Zap className="size-8 text-blue-500" />}
            value={formatPercent(stats.averageWinRate)}
            label="Taxa de vitória média"
          />
        </div>
      </section>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="hover:border-primary/50 p-6 transition-colors">
      <span className="bg-primary/10 flex size-12 items-center justify-center rounded-lg">
        {icon}
      </span>
      <h3 className="font-heading mt-4 text-2xl font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1 leading-relaxed">{description}</p>
    </Card>
  );
}

function StatCounter({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="text-center">
      <div className="mb-2 flex items-center justify-center">{icon}</div>
      <div className="font-heading text-3xl font-bold tabular-nums md:text-4xl">{value}</div>
      <div className="text-muted-foreground mt-1 text-sm">{label}</div>
    </div>
  );
}
