# Node version

There is deliberately **no `engines` field** in package.json.

Both Node 22 and Node 24 were verified end to end — `next build` exits 0 on
each, and every route (`/`, `/catalog`, `/catalog/simulators`, `/login`,
`/setup`, and the marketing apex) returns 200 under both, with no runtime
errors. The app does not care.

An `engines` pin was tried twice and each time it made things worse rather than
better:

- `">=20.9.0"` produced *"will automatically upgrade when a new major Node.js
  Version is released"*.
- `"22.x"` produced *"the Node.js Version defined in your Project Settings
  ('24.x') will not apply"* — it silently overrode a setting that had been
  chosen on purpose in the dashboard.

Neither warning ever indicated a real problem, but both looked alarming in a
build log at exactly the wrong moment. With no `engines` field, Vercel uses the
version selected in **Project Settings → Node.js Version**, the warnings stop,
and the choice lives in one place.

## Reading a Vercel build log

Worth knowing, because two rounds of debugging were spent on warnings:

- A line starting `Warning:` is **not** a failure. The build continues.
- The **`Route (app)`** table with its `┌ ├ └` tree is printed **only after a
  successful build**. If you can see it, the build passed.
- A real failure ends with `Error: Command "npm run build" exited with 1` and
  no route table.

A green build with a broken page means the problem is at **runtime**, not
compile time — look at Vercel's *Runtime Logs* (not the build log), or open
`/api/health` on the deployment.

## When a page shows "Internal Server Error"

A green build and a 500 page are not in conflict. The build compiles code; the
500 happens when that code *runs*, usually because of something only present in
production — an environment variable, a database, a network call. Build logs
cannot show you a runtime failure, and this is the single most common wrong
turn: reading build logs harder.

The page itself now tells you where to look. Instead of a blank
"Internal Server Error" you get **This page could not be rendered** and an
**Error reference** — an eight-to-ten digit digest. Copy it.

Then, in Vercel:

    Deployments → (the deployment) → Runtime Logs      ← not "Build Logs"

Search for the digest, or for `AFRIORBIT_SERVER_ERROR`. Every server-side
failure writes one line in that form followed by the full stack:

    AFRIORBIT_SERVER_ERROR {"digest":"2138189096","message":"...","path":"/dashboard",...}

The `message` is the actual cause. Runtime Logs only stream while the page is
being requested, so open the logs first, then reload the broken page in another
tab.

If nothing appears in Runtime Logs at all, the request never reached the
application — that points at Deployment Protection, a domain pointing at a
different project, or a proxy failure, not at the page.
