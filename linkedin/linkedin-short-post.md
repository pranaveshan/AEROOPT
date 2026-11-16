# Short announcement version

I built AeroOpt — an aviation operations platform where scheduling is a constraint problem, not a spreadsheet.

Aircraft serviceability, maintenance windows, crew qualifications, duty and rest limits, payload, turnaround and task dependencies are all evaluated on the server. If a task cannot be placed, the platform says which constraint blocked it.

Optimisation produces a scored proposal with per-task reasoning; a manager approves it before anything becomes operational.

Built with React 19, Hono on Cloudflare Workers, Cloudflare D1 and pure TypeScript domain engines, with 50 tests over the engine and the API.

Live demo (synthetic data): https://site-6b4858e07ae54a00be427ec8cfa46142.freebuff.page
Code: github.com/pranaveshan/AEROOPT

#aviation #typescript #react #cloudflare #softwareengineering
