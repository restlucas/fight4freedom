/**
 * Header that carries the current pathname from middleware into the render tree.
 *
 * It exists because layouts are not told which URL they are rendering, and the
 * identity gate needs both the path and the session (see
 * src/app/(site)/layout.tsx). Middleware is the only thing that sees both.
 *
 * Its own module rather than an export from `middleware.ts` so that importing the
 * name does not drag the middleware module — Supabase client and all — into a
 * layout's module graph.
 */
export const PATHNAME_HEADER = "x-pathname";
