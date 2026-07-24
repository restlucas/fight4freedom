import { Award, Crosshair, Crown, Medal, Shield, Trophy, Users, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { JoinChannels } from "@/features/clan/components/join-channels";
import { formatKd, formatNumber, formatPercent } from "@/features/clan/lib/format";
import { getClanStats } from "@/features/clan/lib/queries";
import { FORM_URL } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stats = await getClanStats();

  return (
    <>
      {/* Hero */}
      <section className="relative w-full">
        <Image
          src="/hero.avif"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="from-background/60 via-background/70 to-background absolute inset-0 bg-gradient-to-b" />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-28 text-center sm:py-36">
          <h1 className="sr-only">Fight 4 Freedom</h1>
          <p className="font-heading text-4xl font-bold tracking-tight sm:text-6xl">
            BEM-VINDO AO <span className="text-primary">F4F</span>
          </p>
          <p className="mt-6 max-w-2xl text-lg text-pretty sm:text-xl">
            Somos uma comunidade de jogadores dedicados que buscam excelência no
            campo de batalha. Valorizamos trabalho em equipe, comunicação
            estratégica e evolução constante — mas, acima de tudo, diversão.
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
              className="mx-auto h-24 w-auto drop-shadow-lg"
            />
            <p className="mt-6 text-lg leading-relaxed">
              O clã <strong>[F4F] Fight 4 Freedom</strong> nasceu para construir
              uma comunidade sólida e acolhedora para todos os jogadores
              apaixonados por Battlefield — e, quem sabe, por outros jogos no
              futuro.
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
              Reconhecemos o esforço de cada soldado com medalhas curadas pela
              equipe, organizadas por tiers de prestígio.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <TierCard
              icon={<Crown className="size-7 text-violet-300" />}
              title="Lendária"
              description="As conquistas mais raras e prestigiadas."
            />
            <TierCard
              icon={<Trophy className="size-7 text-yellow-400" />}
              title="Ouro"
              description="Feitos extraordinários de combate."
            />
            <TierCard
              icon={<Medal className="size-7 text-zinc-300" />}
              title="Prata"
              description="Conquistas significativas em campo."
            />
            <TierCard
              icon={<Award className="size-7 text-amber-500" />}
              title="Bronze"
              description="Marcos de progresso essenciais."
            />
          </div>

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
              Estamos sempre recrutando para fortalecer a comunidade. Fale com a
              gente pelos canais oficiais e comece sua jornada conosco.
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

function TierCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="items-center p-6 text-center">
      <span className="bg-secondary flex size-14 items-center justify-center rounded-full">
        {icon}
      </span>
      <h3 className="font-heading mt-3 text-lg font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
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
      <div className="font-heading text-3xl font-bold tabular-nums md:text-4xl">
        {value}
      </div>
      <div className="text-muted-foreground mt-1 text-sm">{label}</div>
    </div>
  );
}
