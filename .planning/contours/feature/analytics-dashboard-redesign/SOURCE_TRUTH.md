# Source Truth: feature/analytics-dashboard-redesign

Generated: 2026-06-24T18:40:00Z

```bash
cd /root/processmap_v1
git remote -v
# local-opt	/opt/processmap-test (fetch)
# local-opt	/opt/processmap-test (push)
# new-origin	https://github.com/xiaomibelov/processmap_v1.git (fetch)
# new-origin	https://github.com/xiaomibelov/processmap_v1.git (push)
# origin	git@github.com:xiaomibelov/processmap_v1.git (fetch)
# origin	git@github.com:xiaomibelov/processmap_v1.git (push)

git branch --show-current
# feature/analytics-dashboard-redesign

git rev-parse HEAD
# d1e6adba80c5bfb00dd2ec0865b7f25ce9cedb28

git rev-parse new-origin/main
# d1e6adba80c5bfb00dd2ec0865b7f25ce9cedb28

git status -sb
# ## feature/analytics-dashboard-redesign...new-origin/main
# ?? smoke-analytics-embedded.mjs
# ?? smoke-screenshots-embedded/

git log --oneline -5 new-origin/main
# d1e6adba Merge pull request #412 from xiaomibelov/fix/analytics-compact-embedded
# 543d2f47 fix(analytics): unwrap dashboard payload, compact embedded header, StrictMode-safe auth boot
# 36b7f685 fix(smoke): RootApp hooks order + recompute request scope
```
