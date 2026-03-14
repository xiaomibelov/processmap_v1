cd /Users/mac/PycharmProjects/working_product_baseline || { echo "baseline repo dir not found"; false; }
set -eu

ts="$(date +%Y%m%d_%H%M%S)"
checkpoint_tag="cp/baseline_main_checkpoint_before_stage_release_${ts}"

echo "== repo =="
pwd
git status -sb

echo
echo "== ensure main =="
git checkout main

echo
echo "== remove temporary local helper if present =="
rm -f stage_step1_prepare_release_branch.sh

echo
echo "== checkpoint tag =="
git tag "${checkpoint_tag}" || true

echo
echo "== stage current tracked changes =="
git add -A

echo
echo "== commit current baseline state if needed =="
if git diff --cached --quiet; then
  echo "No local changes to commit"
else
  git commit -m "chore: checkpoint baseline main before stage release prep"
fi

echo
echo "== sync main to origin =="
git fetch origin --tags
git pull --ff-only origin main || true
git push origin main

echo
echo "== final status =="
git status -sb
echo
echo "DONE"
echo "Checkpoint tag: ${checkpoint_tag}"
