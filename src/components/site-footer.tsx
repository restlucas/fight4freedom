"use client";

import {
  DiscordLogoIcon,
  InstagramLogoIcon,
  WhatsappLogoIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react";
import Link from "next/link";

import { DEVELOPER_URL, SOCIAL_LINKS } from "@/lib/site-config";

const socials = [
  {
    href: SOCIAL_LINKS.whatsapp,
    label: "WhatsApp",
    Icon: WhatsappLogoIcon,
    color: "text-green-500",
  },
  {
    href: SOCIAL_LINKS.discord,
    label: "Discord",
    Icon: DiscordLogoIcon,
    color: "text-indigo-400",
  },
  {
    href: SOCIAL_LINKS.instagram,
    label: "Instagram",
    Icon: InstagramLogoIcon,
    color: "text-pink-500",
  },
  {
    href: SOCIAL_LINKS.youtube,
    label: "YouTube",
    Icon: YoutubeLogoIcon,
    color: "text-red-500",
  },
];

export function SiteFooter() {
  return (
    <footer className="bg-card w-full border-t">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
          <div>
            <h3 className="font-heading text-lg font-bold tracking-wide uppercase">
              Fight 4 Freedom <span className="text-primary">[F4F]</span>
            </h3>
            <p className="text-muted-foreground">
              Jogadores dedicados e apaixonados por Battlefield.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {socials.map(({ href, label, Icon, color }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="bg-secondary hover:bg-secondary/70 flex size-11 items-center justify-center rounded-full transition-colors"
              >
                <Icon size={26} weight="fill" className={color} />
              </Link>
            ))}
          </div>
        </div>

        <div className="text-muted-foreground mt-8 border-t pt-6 text-center text-sm">
          <p>© 2025 Fight 4 Freedom. Todos os direitos reservados.</p>
          <p className="mt-1">
            Desenvolvido por{" "}
            <Link
              href={DEVELOPER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              [F4F] melansia
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
