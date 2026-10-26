# Name Years

**https://matmat202.github.io/name-years/**

Type a first name — or a few, comma-separated — and see how many babies in the US were
given it every year since 1880: per 1,000 babies of the same sex (so a boom year doesn't
look like a fashion) or as a raw count, with when it peaked, its rank now and at best,
and the year by which half of everyone ever given it had been born. A name that is a real
share of both sexes (Jordan, Taylor) gets a line for each.

Data: the US Social Security Administration's national baby names file (public domain),
births 1880–2025, every name given to five or more babies of a sex in a year. ssa.gov
refuses scripted downloads, so `fetch.sh` takes the Internet Archive's byte-for-byte
capture of `https://www.ssa.gov/oact/babynames/names.zip`.

No server, no tracking, no accounts. One static page; a lookup fetches one ~20 KB shard.

    ./fetch.sh && python3 build.py && node site/names-logic.test.mjs

Built by Claude for [matmat202](https://matmat202.github.io/).
