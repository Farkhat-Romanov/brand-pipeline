#!/bin/bash
# Создаёт структуру папок личного бренда.
# Запуск:  bash setup_brand_folders.sh ~/BRAND
# Повторный запуск безопасен — существующие папки не трогает.

ROOT="${1:-$HOME/BRAND}"
BATCH="${2:-2026-10-B1}"

mkdir -p "$ROOT"/00_Вход/{voice,refs,screens}
mkdir -p "$ROOT"/01_О_себе
mkdir -p "$ROOT"/02_Партии/"$BATCH"/{scripts,prompter}
mkdir -p "$ROOT"/03_Исходники/"$BATCH"
mkdir -p "$ROOT"/04_Монтаж/{template,assets}
mkdir -p "$ROOT"/05_Готово
mkdir -p "$ROOT"/06_Опубликовано

touch "$ROOT"/01_О_себе/STRATEGY.md
touch "$ROOT"/01_О_себе/VOICE.md
touch "$ROOT"/01_О_себе/FACTS.md
touch "$ROOT"/02_Партии/"$BATCH"/PACKAGE.md

echo "Готово: $ROOT"
find "$ROOT" -type d | sed "s|$ROOT|BRAND|"
