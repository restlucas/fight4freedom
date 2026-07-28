"use client";

import { DiscordLogoIcon, HardDrivesIcon, WhatsappLogoIcon } from "@phosphor-icons/react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SOCIAL_LINKS } from "@/lib/site-config";

export function JoinChannels() {
  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
      <Card className="hover:border-primary items-center p-8 text-center transition-colors">
        <Link
          href={SOCIAL_LINKS.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center"
        >
          <span className="bg-secondary mb-4 flex size-16 items-center justify-center rounded-full">
            <WhatsappLogoIcon size={30} weight="fill" className="text-green-500" />
          </span>
          <h3 className="font-heading text-xl font-semibold">WhatsApp</h3>
          <p className="text-muted-foreground mt-1 text-sm">Fale direto com nossos recrutadores.</p>
        </Link>
      </Card>

      <Card className="hover:border-primary items-center p-8 text-center transition-colors">
        <Link
          href={SOCIAL_LINKS.discord}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center"
        >
          <span className="bg-secondary mb-4 flex size-16 items-center justify-center rounded-full">
            <DiscordLogoIcon size={30} weight="fill" className="text-indigo-400" />
          </span>
          <h3 className="font-heading text-xl font-semibold">Discord</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Nossa base de comunicação e organização.
          </p>
        </Link>
      </Card>

      <Card className="items-center p-8 text-center">
        <span className="bg-secondary mb-4 flex size-16 items-center justify-center rounded-full">
          <HardDrivesIcon size={30} weight="fill" className="text-primary" />
        </span>
        <h3 className="font-heading text-xl font-semibold">Servidor BF6</h3>
        <p className="text-muted-foreground mt-1 text-sm">Nosso servidor oficial no jogo.</p>
        <Badge variant="outline" className="mt-3 font-mono text-xs">
          [F4F] Fight 4 Freedom
        </Badge>
      </Card>
    </div>
  );
}
