import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/pdi/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await (await auth()).protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
