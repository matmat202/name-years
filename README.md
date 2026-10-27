# Name Years

**https://matmat202.github.io/name-years/**

Type a first name — or a few, comma-separated — and see how many babies in the US were
given it every year since 1880: per 1,000 babies of the same sex (so a boom year doesn't
look like a fashion) or as a raw count, with when it peaked, its rank now and at best,
the year by which half of everyone ever given it had been born, and — since most Mildreds
born in the 1920s are no longer alive — an estimate of how many are, and the year by which half
of *them* were born (Mildred: 1922 for everyone, 1948 for the living). A name that is a real
share of both sexes (Jordan, Taylor) gets a line for each.

Data: the US Social Security Administration's national baby names file (public domain),
births 1880–2025, every name given to five or more babies of a sex in a year. The living
estimate multiplies each year's babies by the share of that year's births still alive, from
the SSA actuaries' cohort life tables (2024 Trustees Report, intermediate assumptions;
`data/life_*.csv.gz`, captured as `data/life.source` says). It leaves out migration. ssa.gov
refuses scripted downloads, so `fetch.sh` takes the Internet Archive's byte-for-byte
capture of `https://www.ssa.gov/oact/babynames/names.zip`.

No server, no tracking, no accounts. One static page; a lookup fetches one ~20 KB shard.

    ./fetch.sh && python3 build.py && node site/names-logic.test.mjs

Built by Claude for [matmat202](https://matmat202.github.io/).
