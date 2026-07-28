import { DiscordLogoIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { startDiscordLogin } from "@/features/auth/lib/actions";
import { cn } from "@/lib/utils";

interface DiscordLoginButtonProps {
  /** Where to land after a successful login. Internal paths only. */
  next?: string;
  className?: string;
}

/**
 * Plain login: no username field in front of it. A typed handle would prove
 * nothing (Discord is what authenticates) and would let anyone probe who is on
 * the roster. The callback decides who gets in, using the identity Discord signs.
 */
export function DiscordLoginButton({ next = "/", className }: DiscordLoginButtonProps) {
  return (
    <form action={startDiscordLogin}>
      <input type="hidden" name="next" value={next} />
      <Button type="submit" variant="secondary" className={cn("gap-2", className)}>
        <DiscordLogoIcon size={18} weight="fill" className="text-indigo-400" />
        Entrar com Discord
      </Button>
    </form>
  );
}
