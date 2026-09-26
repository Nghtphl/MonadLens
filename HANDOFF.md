# HANDOFF — MonadLens

Durum: 2026-09-26 16:05. Branch `cleanup` (HEAD `18a559f` + bu HANDOFF commit'i), çalışma ağacı temiz (`.agents/` hariç). Canlı bu sürümde (deploy `monadlens-7f6a7t7mo`). `main` hâlâ `3796e77` (before-cleanup); `cleanup` main'e merge edilmedi. Git remote yok, hiçbir şey push edilmedi.

## Teslim reposu

- https://github.com/Nghtphl/MonadLens
- **Uyarı:** Asıl repo geçmişinde GPL dosyaları var; asıl repo asla doğrudan push edilmemeli, teslim reposu `git archive` ile üretilir.

## Canlı

- https://monadlens-rust.vercel.app (Vercel hesabı `nghtphl`, proje `monadlens`). Sadece bu adresi paylaşın; deploy'a özel `monadlens-xxxx-….vercel.app` adresleri Vercel girişi ister.
- Güncellemek için: `npx vercel --prod --yes`. `.vercelignore` `.agents`, `.claude`, `scripts` klasörlerini dışarıda bırakır.
- Canlıda ölçüm kapalı: `VERCEL` tanımlı ve `MEASURE_SERVICE_URL` tanımsız olduğu için `/api/simulate` "Measurement runs locally, see README" döner. `MEASURE_SERVICE_URL` (+ `MEASURE_SERVICE_TOKEN`) Vercel'e eklenince istekler ölçüm konteynerine iletilir. Slither sekmesi canlıda "Slither unavailable" gösterir. Statik analiz ve Fix/diff canlıda çalışır.
- Son canlı kontrol (2026-09-26 16:05, deploy `monadlens-7f6a7t7mo`, `GEMINI_API_KEY` Vercel Production'da): BadNFT P1 × 2; Fix → diff açılıyor (Trade-offs var); buton yanında Google Gemini notu görünüyor; Explain → "Static explanation" (sebep: "The AI service timed out"; canlıda iki denemede de Gemini 20 sn'de yanıt vermedi, yerelde AI yanıtı alınmıştı); Slither sekmesi "General security scan runs in the local/Docker setup, see README."

## Bitenler (Claude Code)

- Çekirdek: parser, P1/P2/M1, skor, Monaco satır işaretleri, demo seçici — `e460beb`, `d071238`
- OCC simülatörü (saf fonksiyon + testler) — `a1ad699`
- Ölçüm: solc + anvil + prestateTracer (işlem başına iki iz: okumalar normal moddan, yazmalar diffMode'dan) + `/api/simulate` — `f83f652`
- Measure paneli, fonksiyon seçici, yer tutucu argümanlar — `1a42063`, `a057a53`
- uint yer tutucusu 1000, revert sayısı (yarıdan fazlası revert ederse "Not measured"), anvil kararlılık düzeltmeleri — `c740515`
- Constructor argümanları — `dadaa46`
- P8_INHERENT, M1 → `block-timestamp` şablonu — `c64a686`
- Fix → DiffView → "Apply & re-measure", önce/sonra tablosu — `ff8edb2`
- P3_GLOBAL_ACCUMULATOR (P1 artık sadece sabit artış), P3'te Fix yok — `7482fa3`
- Vercel'de ölçümü kapatma — `4bfdd52`; `.vercelignore` — `4fe7cde`
- CLAUDE.md §5C: admin kısıtlı P1–P5 bulguları gizlenir — `859f2be`
- Birden fazla kontratlı dosyada kaynak sırasındaki son kontratı ölçme — `1e64fec`
- README (Türkçe) — `7e4087c`, rakam güncellemesi `14cebd7`
- Sayfa başlığı/açıklaması — `ee98be2`
- Blok replay (DAG turları, önce/sonra yan yana, oynat/durdur/hız) — `35c11b6`
- Sıcak slot → değişken → satır, tıklayınca satır vurgusu, "Predicted & measured" rozeti, "Not caught by static rules" — `aea7374`
- Codex merge'leri: `c99060d`, `c539d65`, `6f752af` (`c927c60` dahil), `069c851` (`dc513d7`, Slither)
- Shard grupları ("Sharded" bölümü), Fix uygulanamazsa uyarı, gas maddesinin sebebi — `70be9ad`
- Monad / Slither sekmeleri (ikisi de mount'lu kalır, sekme değişince sonuçlar korunur) — `2c61380`
- `/api/simulate` sınırları: `lib/ratelimit.ts` (IP başına 10/dk, bellek içi sabit pencere), solc worker'da 20 sn, ölçüm 60 sn, gövde 256 KB, kaynak 50k karakter; her istekte yeni anvil süreci (doğrulandı) — `8328550`
- Uzak ölçüm modu `MEASURE_SERVICE_URL` (+ `MEASURE_SERVICE_TOKEN` ile gerçek istemci IP'si iletilir; servis kapalıysa "Not measured") — `6c79b7a`
- 5 gerçek kontratla doğrulama, `docs/validation.md`, `fixtures/realworld/` (sentetikler `synthetic/` altında), `scripts/realworld-check.ts --measure` — `e6028f1`
- Yanlış pozitif düzeltmesi: rezervlerle aynı fonksiyonda yazılan birikimler P3 değil P8 (Uniswap V2 Pair 60 → 100) — `8c9de2a`
- Lisans temizliği: GPL kontratlar (UniswapV2Pair, WETH9) repodan çıkarıldı, `.gitignore` ve `.vercelignore`'da, `scripts/fetch-realworld.ts` sabit commit'lerden indirir; MIT dosyalarında tam lisans metni — `7290b02`, `168ffcc`
- SafeMath / kendine atama (`x = x + c`, `x = x.add(c)`, `x = x.sub(c)`) P1 (sabit adım) ve P3 (miktar) olarak tanınıyor; ortak eşleyici `lib/analyzer/accumulation.ts` — `8f8f584`
- Modifier gövdeleri taranıyor (`lib/analyzer/modifiers.ts`; P1, P2, P3, P8), bulgu fonksiyonun adı ve ağırlığıyla; yeni `C1_REENTRANCY_GUARD` (info, `ReentrancyGuardTransient` önerisi, çakışma iddiası yok; CLAUDE.md §5C'ye satır eklendi) — `d098727`
- `docs/validation.md` skor geçmişi ve açık işler — `8e0dd1b`, `d65b3b2`
- Modifier ağırlığı: çağıranı kontrol etmeyen modifier'lar (`nonReentrant`, `whenNotPaused`, `updateReward`) fonksiyonu 1.0'da bırakır; kontrol eden (whitelist, merkle, bir seviye helper) 0.5; admin aynen; dosyada olmayan modifier 0.5 — `6ea243e`
- Paylaşılan modifier'daki yazma yazma yeri başına tek bulgu (en yüksek ağırlık, fonksiyonlar mesajda); fonksiyon gövdeleri fonksiyon başına — `554875e`
- `lastUpdateTime` sınırlaması + ölçüm kanıtı (`fixtures/measure/StakingRewardsCore.sol`, sayfada "Not caught by static rules") — `a116202`
- `/findings` sayfası (§17 Tier 2): `scripts/realworld-check.ts --measure --json` → `data/realworld-findings.json` → `app/findings/page.tsx` (statik); 8 kontrat + ölçüm kopyası, "statik kaçırdı / ölçüm yakaladı" kutusu (`lastUpdateTime`); ana sayfada link — `0df4081`
- Playwright uçtan uca testi (§18 Tier 2 madde 3): `npm run test:e2e` (`e2e/badnft.e2e.ts`); yerelde kritik yol 100 → 9. anvil yoksa ya da uygulama "Not measured" dönerse ölçüm adımlarını atlar ve bunu yazar (canlıya karşı: `E2E_BASE_URL=https://monadlens-rust.vercel.app npm run test:e2e`). Kurulu Chrome'u kullanır — `25c85c6`
- StakingRewardsCore kopyasına kaynak + tam Synthetix MIT metni; `/findings` canlıda doğrulandı — `ed6c005`
- AI açıklama katmanı (§13): `lib/explain/fallbacks.ts` (P1, P2, P3, P8, M1, C1 için sabit metin, sayı yok) — `75cc323`; `docs/monad/` (docs.monad.xyz'den özet, linkli, 2026-09-26) — `2b9f0f9`; `/api/explain` (Gemini Interactions API, `GEMINI_MODEL` varsayılan `gemini-3.5-flash`, önbellek hash(ruleId+snippet), IP başına 20/dk, kaynaklarda olmayan sayı içeren yanıt → statik) — `730ffc9`; her bulguda Explain + anahtar varsa Gemini notu, e2e adımı — `ce6f18f`. `.env`'deki anahtarla denendi: ilk çağrı zaman aşımı (Gemini yoğun), ikincisi AI yanıtı, üçüncüsü önbellek.
- İç çağrılar bir seviye (`lib/analyzer/calls.ts`): rezervlere doğrudan/bir çağrıyla ulaşan ya da tüm çağıranları ulaşan (internal) fonksiyondaki birikimler P8; `x = f()` (`f` view/internal ve `x`'i okuyor) P3 — `589dc3d`

Ölçülen sonuçlar (anvil 1.5.1, 100 işlem, deterministik): BadNFT kritik yol 100 → 9 (Fix sonrası), ort. gas 48,765 → 59,654; AMMPool 100 (P8, beklenen); OZ ERC20 + mint harness 100 (`_totalSupply`); OZ ERC721 + mint harness 1. Testler: 90/90. Doğrulama skorları: OZ ERC20 60, OZ ERC721 100, StakingRewards 20, UniswapV2Pair 80, WETH9 100 (tablo: `docs/validation.md`).

## Yarım kalanlar

Yok. Bulut oturumunun (2026-09-26 14:00) üç işi yerelde doğrulandı ve commit'lendi (2026-09-26 14:35):

1. Fix uygulanamazsa uyarı (`app/page.tsx` → `fixAttempt`): `contract Counter { uint256 public count; function increment() external { count++; } }` → P1 → Fix → bulgunun altında sarı "This fix could not be applied to this code automatically…" kutusu. Kaynak değişince kutu kayboluyor.
2. Shard grupları (`lib/simulator/shards.ts`, `trace.ts`, `SimulationResultMeasured.shardGroups`, `MeasurePanel.tsx`): BadNFT Fix sonrası `_shardCounts` ve `_activeByShard` "Sharded" bölümünde, "contention split across 16 slots (expected) · at most 9 of 100 txs write the same slot"; "Not caught by static rules" bölümü görünmüyor.
3. Sharded counter gas maddesi: Trade-offs'ta "Higher gas per mint: because burn is kept, each mint writes two per-shard counters…".

Tarayıcıda ölçülen (anvil 1.5.1, 100 işlem): BadNFT kritik yol 100 → 9, yeniden yürütme 99 → 84, ideal paralellik 1.0× → 11.1×, ort. gas 48,765 → 59,654, önerilen gas limiti 72,264 → 97,221; `burn` duruyor. BadLending M1 Fix: `borrow` ve `Loan` duruyor, kritik yol 1 → 1, gas 65,832 → 65,832. AMMPool: P8 × 2, Fix yok, kritik yol 100, gas 31,364. `tsc` temiz, vitest 60/60.

## Codex

- Worktree: `/Users/yakupsmac/monadlens-codex`, branch `codex-fixes`.
- `codex-fixes` son hâli `c6223fa`; `5d1a59b` ile çakışmasız merge edildi (tsc, vitest 106/106, build, e2e geçti; `npm install` sonrası kilit düzenlemesi `18a559f`). İçerik: Docker (`Dockerfile`, `docker-compose.yml`, `.dockerignore`, README "Docker ile çalıştırma"), Slither yol temizliği ve kullanıcı mesajı, `scripts/slither-check.ts` düzeltmesi, MCP sunucusu (`mcp/server.ts`: `analyze_contract`, `measure_contract`; `npm run mcp`, README "MCP sunucusu").
- Slither (`dc513d7`) `069c851` ile merge edildi, sayfaya bağlandı (`2c61380`).
- Codex'te açık: `/api/security`'ye `lib/ratelimit.ts` bağlanmadı (Plan Codex 3).
- Karar (kullanıcı): `source` alanı **opsiyonel** (`source?: FindingSource`, yoksa `monadlens` sayılır); Codex kural dosyalarındaki değişikliklerini geri aldı. Merge'de P3'e `source` eklemek gerekmiyor. Codex'in `lib/types.ts` değişikliği sadece `FindingSource` tipi + opsiyonel alan; bizim `shardGroups` eklememizle aynı dosyada ama farklı yerde.

## Dosya sınırları

- Codex'in alanı: `lib/fixer/`, `lib/security/`, `components/DiffView.tsx`, `components/SecurityPanel.tsx`, `mcp/`, `fixtures/`.
- Claude Code'un alanı: `app/page.tsx`, `lib/types.ts`, `lib/analyzer/` (kurallar, `locate.ts`), `lib/simulator/`, ölçüm ve replay bileşenleri (`components/MeasurePanel.tsx`, `components/BlockReplay.tsx`).
- Claude Code, Codex'in dosyalarını düzenlemez; sadece merge eder ve sayfaya bağlar.

## Merge kuralı

1. Claude Code kendi işini commit'ler.
2. `git merge codex-fixes`. Çakışma olursa kendisi çözmez, kullanıcıya gösterir.
3. `npx tsc --noEmit -p .`, `npm test`, `npm run build`.
4. Üç demo akışını tarayıcıda doğrular: BadNFT (Measure → Fix → Apply, kritik yol 100 → 9, `burn` duruyor), BadLending (M1 Fix; Apply sonrası `borrow` ve `Loan` duruyor), AMMPool (P8, Fix yok, ölçümde çakışma var).

- Bekleyen merge: yok. Son: `c6223fa` → `5d1a59b`.
- İstisna (kullanıcı onaylı, 2026-09-26): doğrulama işi için Claude Code `fixtures/realworld/` altına yazdı ve `scripts/realworld-check.ts` ile `scripts/slither-check.ts`'teki (sadece yollar) değişiklikleri yaptı.

## Plan (2026-09-26 14:25, kullanıcı: önce Tier 1'i bitir, sonra ek özellikler, en son arayüz)

Claude Code (1–5 bitti, 2026-09-26 15:00):
1. ~~Yarım kalanları doğrula, commit'le, deploy et.~~ `70be9ad`, deploy edildi.
2. ~~`lib/ratelimit.ts` (IP başına, bellek içi, sabit pencere) + `/api/simulate`'te kaynak boyutu sınırı ve zaman aşımı (derleme 20 sn, ölçüm 60 sn); her istekte temiz anvil (zaten yeni süreç, doğrula). Testli.~~ `8328550`
3. ~~Uzak ölçüm modu: `MEASURE_SERVICE_URL` tanımlıysa `/api/simulate` isteği o servise iletir; tanımlı değilse ve `VERCEL` varsa bugünkü "Measurement runs locally" mesajı.~~ `6c79b7a`
4. ~~5 gerçek kontrat raporu~~ `e6028f1` + kural düzeltmesi `8c9de2a`. Sonuç: 0 çökme, 0 parse hatası, 1 yanlış pozitif (düzeltildi), 2 yanlış negatif (düzeltildi: `8f8f584`, `d098727`; biri kısmen, bkz. Bekleyen işler).
5. ~~`codex-fixes`'i merge et.~~ `069c851`, Slither sekmesi `2c61380`.

Codex:
1. ~~Slither'ı commit'le~~ bitti: `dc513d7` (`codex-fixes`, tsc temiz, 51/51 test). MCP ertelendi.
2. `Dockerfile` + `docker-compose.yml` + `.dockerignore`: Node, Foundry/anvil (sabit sürüm), Python + Slither, sabit solc; istek anında dışarıya ağ yok. `docker compose up` ile uygulama ölçüm ve Slither dahil çalışmalı. README'ye kısa "Docker ile çalıştırma" bölümü.
3. `/api/security`'ye Claude Code'un `lib/ratelimit.ts`'ini bağla (merge sonrası).

Kullanıcı: container servisini Railway/Fly/Render'a deploy etmek (hesap gerekir), Vercel'e `MEASURE_SERVICE_URL` eklemek, 90 sn demo kaydı.

## Bekleyen işler

- CLAUDE.md §18 Tier 1'de kalanlar: konteynerin Railway/Fly/Render'a deploy'u ve Vercel'e `MEASURE_SERVICE_URL` (kullanıcı), 90 saniyelik demo kaydı (kullanıcı). §16'dan kalan: konteynerde istek anında dışarı ağ bağlantısını kapatmak (README: Compose tek başına engellemiyor; platform ağ politikası/firewall gerekli), `/api/security` için IP limiti (Codex 3). `docker compose up` yerelde bu oturumda denenmedi.
- **Kural ayarı bitti (kullanıcı kararı, 2026-09-26).** Yeni kural/ince ayar yok; sadece hata düzeltmeleri.
- Bilinen statik sınırlar (`docs/validation.md` "Hâlâ açık"): StakingRewards `lastUpdateTime` statik kurallarla yakalanmıyor, ölçümle yakalanıyor ("Not caught by static rules", `fixtures/measure/StakingRewardsCore.sol`); `rewardPerTokenStored` tek blokta (aynı `block.timestamp`) ölçümde sıcak çıkmıyor.
- İç çağrılar sadece bir seviye: UniswapV2ERC20 `_mint` P3 kaldı, çünkü `_mintFee` de çağırıyor ve rezervlere iki seviyede ulaşıyor (UniswapV2Pair 80, 100 değil).
- İç fonksiyon bulguları "every caller" diyor (OZ ERC20 `_update`: `transfer` `_totalSupply`'a dokunmuyor).
- `C1_REENTRANCY_GUARD` sadece modifier gövdelerindeki yazmaları görüyor; OZ v4.9+/v5'te guard `_nonReentrantBefore()` iç fonksiyonunda, o yüzden orada C1 çıkmaz (P1'e de düşmez, çünkü `_status = ENTERED` düz atama).
- Ölçüm sadece solc 0.8.x: 0.4/0.5 kontratları (Uniswap V2, WETH9, StakingRewards) "Compilation failed". Docker imajına birkaç sabit solc sürümü eklenebilir.
- Kalan kurallar: P4–P7, M2–M5.

## Bilinen sorunlar

- CLAUDE.md §9 blok süresi 300 ms'ye güncellendi (`5181d5c`, docs.monad.xyz/ai/current-facts, 2026-09-26).
- Gemini: canlıda Explain iki denemede de 20 sn zaman aşımına uğradı (statik açıklama gösterildi); yerelde de ilk çağrı zaman aşımıydı, sonrakiler AI yanıtı verdi. Düşünme süresi/model yoğunluğu olası sebep; zaman aşımı (`lib/explain/explain.ts`, 20 sn; route `maxDuration` 30 sn) ya da model (`GEMINI_MODEL`) ayarlanabilir. Önbellek süreç içi (Vercel'de örnek başına); demo için önceden üretilmiş açıklama önbelleği (§13) yok.
- `.env.example` bir ara çalışma ağacında silinmişti (muhtemelen `.env`'e dönüştürülürken); git'ten geri getirildi, Gemini değişkenleri eklendi.
- **ZORUNLU, repo herkese açık gönderilmeden ÖNCE:** GPL dosyaları (`fixtures/realworld/UniswapV2Pair.sol`, `fixtures/realworld/WETH9.sol`) `e6028f1` commit geçmişinde duruyor; `git filter-repo --path <dosya> --invert-paths` ile geçmişten silinmeli (tüm branch'lerde, Codex worktree'si durdurulmuşken). Bugün itibarıyla repoda değiller, `.gitignore`'dalar ve `scripts/fetch-realworld.ts` ile indiriliyorlar.
- Canlıdaki "see README" mesajı bir linke bağlı değil (repo push edilmedi).
- Bazı bozuk girdilerde parse hatası satır/sütun yerine parser'ın ham `TypeError` mesajını gösteriyor (ör. "Cannot read properties of null").
- Ölçüm sınırları: tek dosya, dosyadaki son somut kontrat, argümanlar yer tutucu (`uint` → 1000, `address` → gönderen, `bool` → true, `bytes32` → 0); string/dizi/struct desteklenmiyor; miras alınan fonksiyonlar dropdown'da görünmüyor; sıcak slotlar ilk 10 ile sınırlı.
- P8 rezervleri değişken adından, admin kısıtını modifier adından tanır (sezgisel).
- `lib/` altında 35 ESLint `no-explicit-any` hatası var; bilerek dokunulmadı, build'i durdurmuyor.
- anvil `~/.foundry/bin/anvil` (1.5.1, `foundryup` ile kuruldu). Uygulama önce `ANVIL_PATH`, sonra bu yolu, sonra `PATH`'i dener.
- `.agents/` izlenmiyor (bir skill kopyası); commit'lenmemeli.
- Editör: tek satırlık uzun bir kod yazıp sonra demo değiştirince Monaco yatay kaydırmayı koruyor; yeni kodun sol tarafı görünmüyor (kozmetik, `app/page.tsx`).
- Konsol: Fix penceresi kapanırken (Apply/Cancel) `TextModel got disposed before DiffEditorWidget model got reset` yakalanmamış hatası (Monaco DiffEditor unmount sırası; `components/DiffView.tsx`, Codex). Sayfa çalışmaya devam ediyor; dev modda hata katmanında görünebilir.
- Slither kullanıcı mesajı ve bulgu yollarındaki geçici klasör Codex'in `d82dccd`, `66a8421` commit'leriyle düzeltildi.
- `scripts/slither-check.ts` Codex'in `37c33e0` commit'iyle düzeltildi (bu oturumda çalıştırılmadı).
- `/api/simulate`'in IP limiti bellek içi: Vercel'de her örneğin kendi tablosu var; asıl limit ölçüm konteynerinde. `x-forwarded-for`'un son girdisi kullanılır; konteyner başka bir proxy arkasındaysa bunu kontrol edin.

## Komutlar

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

```bash
node scripts/probe-prestate-tracer.mjs
```

```bash
npx tsx scripts/realworld-check.ts --measure
```

```bash
npx tsx scripts/realworld-check.ts --measure --json
```

```bash
npm run test:e2e
```
