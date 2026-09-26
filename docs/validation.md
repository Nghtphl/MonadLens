# Gerçek kontratlarla doğrulama (CLAUDE.md §17, Tier 1)

Tarih: 2026-09-26. MonadLens `cleanup` dalı, solc 0.8.37 (npm), anvil 1.5.1.

Yeniden üretmek için:

```bash
npx tsx scripts/realworld-check.ts --measure
```

`--measure` olmadan sadece statik analiz çalışır. Ölçüm için anvil gerekir (bkz. README).

`/findings` sayfası `data/realworld-findings.json`'dan beslenir. Bu dosya elle yazılmaz; şu komut üretir (ölçüm dahil, `fixtures/measure/` kopyaları da ölçülür):

```bash
npx tsx scripts/realworld-check.ts --measure --json
```

**GPL-3.0 kontratlar repoda tutulmuyor.** `UniswapV2Pair.sol` ve `WETH9.sol` `.gitignore`'da. `scripts/fetch-realworld.ts` bunları sabit commit'li orijinal GitHub adreslerinden indirip `fixtures/realworld/` altına yazıyor (Uniswap dosyalarını aynı sırayla birleştirmek dahil). `realworld-check.ts` bu dosyalar eksikse önce betiği kendisi çalıştırır; indirme başarısız olursa nasıl indirileceğini söyleyip diğer kontratlarla devam eder. İndirilen içerik, bu rapordaki sonuçların alındığı dosyalarla satır satır aynı.

```bash
npx tsx scripts/fetch-realworld.ts
```

## Kontratlar

Her dosyanın başında kaynak URL'si, commit/etiket ve lisans yorum olarak yazılıdır. MIT dosyalarının (OZ ERC20/ERC721, StakingRewards) başında orijinal telif satırı ve tam MIT izin metni de var. Bu yüzden OZ ve StakingRewards'ta satır numaraları kaynak dosyadan kaymıştır; rapordaki numaralar fixture dosyalarına göredir. Dosyalar `fixtures/realworld/` altındadır. Codex'in yazdığı 3 sentetik kontrat `fixtures/realworld/synthetic/` altına taşındı; betik ikisini de çalıştırır.

| Dosya | Kaynak | Sürüm | Lisans | Birleştirme |
|---|---|---|---|---|
| `OpenZeppelinERC20.sol` | [OpenZeppelin/openzeppelin-contracts](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/token/ERC20/ERC20.sol) | `v5.0.2` | MIT | `forge flatten` |
| `OpenZeppelinERC721.sol` | [OpenZeppelin/openzeppelin-contracts](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/token/ERC721/ERC721.sol) | `v5.0.2` | MIT | `forge flatten` |
| `UniswapV2Pair.sol` (indirilir) | [Uniswap/v2-core](https://github.com/Uniswap/v2-core/blob/6a9e7c97860676e0992f22a49665760444c1cdf5/contracts/UniswapV2Pair.sol) | `6a9e7c9` | GPL-3.0 | Betik (import'lar kaldırıldı, bağımlılık sırasıyla birleştirildi); `forge flatten` 0.5.16'nın parantezsiz Yul `chainid`'ini ayrıştıramıyor |
| `WETH9.sol` (indirilir) | [gnosis/canonical-weth](https://github.com/gnosis/canonical-weth/blob/0dd1ea3e295eef916d0c6223ec63141137d22d67/contracts/WETH9.sol) | `0dd1ea3` | GPL-3.0 | Tek dosya, değişmedi |
| `StakingRewards.sol` | [Uniswap/liquidity-staker](https://github.com/Uniswap/liquidity-staker/blob/3edce550aeeb7b0c17a10701ff4484d6967e345f/contracts/StakingRewards.sol) + OpenZeppelin `v2.3.0` | `3edce55` | Depoda lisans yok. Synthetix StakingRewards'ın (MIT) Uniswap fork'u; dosyada Synthetix'in MIT metni (npm `synthetix@2.21.0`) ve OZ 2.3.0'ın MIT metni var | `forge flatten` |

StakingRewards notu: `github.com/Synthetixio/synthetix` indirilemedi (`git ls-remote`: "Repository not found"). Bu yüzden Uniswap'in UNI likidite madenciliğinde kullandığı fork'u alındı. Mantığı Synthetix sürümüyle aynı (`updateReward`, `rewardPerTokenStored`, `_totalSupply`).

## Sonuçlar

Çökme: **0**. Parse hatası: **0** (8 kontratın hepsinde; 5'i gerçek, 3'ü sentetik). Sayfada da denendi: 5 gerçek kontrat editöre yüklendi, skor, bulgular ve editör işaretleri betikle aynı çıktı, sözdizimi hatası kutusu çıkmadı.

| Kontrat | Heuristic skor | Statik bulgular | Ölçüm (100 işlem, 100 ayrı gönderen) |
|---|---|---|---|
| OZ ERC20 | 60 | P3 × 2: `_totalSupply`, `_update` (satır 512 `+=`, 527 `-=`) | `ERC20Harness.mint()`: kritik yol **100**, yeniden çalıştırma 99, ort. gas 50,781, önerilen limit 74,481; sıcak slot `_totalSupply` (100 yazan, 100 okuyan) |
| OZ ERC721 | 100 | yok | `ERC721Harness.mint()`: kritik yol **1**, yeniden çalıştırma 0, ort. gas 68,047, önerilen limit 74,852 |
| UniswapV2Pair | 60 | P3 × 2: `price0CumulativeLast`, `price1CumulativeLast` (355, 356); P8 × 2: `reserve0`, `reserve1` (358, 359) | Ölçülmedi: `pragma =0.5.16`, uygulamadaki solc 0.8.37 |
| WETH9 | 100 | yok | Ölçülmedi: `pragma ^0.4.18` |
| StakingRewards | 100 | yok | Ölçülmedi: `pragma ^0.5.16` |
| synthetic/SimpleERC20 | 100 | yok | — |
| synthetic/SimpleERC721 | 100 | yok | — |
| synthetic/SimpleStaking | 60 | P3 × 2: `totalStaked` (`stake`, `withdraw`) | — |

Harness'ler: OpenZeppelin ERC20 ve ERC721 soyut (abstract) sözleşmeler, deploy edilemiyorlar. Ölçüm için betik kaynağın sonuna yalnızca ölçüm sırasında küçük bir public `mint()` ekliyor: ERC20 için `_mint(msg.sender, 1000)`, ERC721 için `_mint(msg.sender, uint160(msg.sender))`. Statik analiz her zaman dosyanın değiştirilmemiş hâlini görür.

## Değerlendirme

### Doğru sonuçlar

- **WETH9 (100):** `deposit`, `withdraw`, `transfer` sadece `balanceOf[msg.sender]` / `balanceOf[dst]` yazıyor. `totalSupply()` bir `view` (`this.balance`). Global sayaç yok, bulgu çıkmaması doğru.
- **OZ ERC721 (100):** v5 tabanında `totalSupply` veya token id sayacı yok. `_balances[to] += 1` sabit bir anahtara değil, alıcıya yazıyor. Ölçüm de bunu doğruluyor: kritik yol 1.
- **OZ ERC20, `_totalSupply` (P3):** Mint yolu için doğru. Ölçümde her mint aynı slota yazıyor, kritik yol 100. Bir kısıtı var: bulgu metni "every caller reads and writes the same slot" diyor, ama `transfer` ve `transferFrom` `_totalSupply`'a dokunmuyor (satır 512 sadece `from == 0`, satır 527 sadece `to == 0` dalında). Çakışma, türeyen kontrat public bir mint/burn açtığında ortaya çıkıyor. Yanlış pozitif değil ama metin abartılı; bkz. açık işler.
- **UniswapV2Pair, `reserve0/1` (P8):** Doğru. Her swap, mint, burn ve sync rezervleri yazıyor; bu çakışma havuzun doğası gereği ve Fix önerilmiyor.

### Yanlış pozitif

1. **UniswapV2Pair `price0CumulativeLast` / `price1CumulativeLast` → P3 (high).** Bu değişkenler TWAP oracle birikimleri ve `_update` içinde rezervlerle birlikte yazılıyor. Kaynaktaki yorum ("on the first call per block, price accumulators") gösteriyor ki bir blokta sadece ilk çağrı yazıyor (`timeElapsed > 0`). Çakışmayı zaten rezervler (P8) belirliyor; birikimler buna ek bir seri hâle getirme getirmiyor. Shard'lamak da oracle'ı bozar. P3 bunları high olarak raporlayıp skoru 40 puan düşürüyor. Doğru sınıf P8'dir (inherent, Fix yok).
   → Düzeltildi, bkz. [Düzeltmeler](#düzeltmeler).

### Yanlış negatifler (kaçırılan çakışmalar)

İlk raporda açık iş olarak listelendi; durumları [Düzeltmeler](#düzeltmeler) bölümünde. Ölçüm 0.5.16 kontratlarında çalışmadığı için bu ikisi ölçümle doğrulanmadı; değerlendirme kaynak okumaya dayanıyor.

1. **StakingRewards `_totalSupply = _totalSupply.add(amount)` (satır 593, 601).** Her `stake`/`withdraw` aynı slota okuma-yazma yapıyor. P3 sadece `+=`/`-=` operatörlerini tanıyor, SafeMath tarzı `x = x.add(y)` / `x = x + y` atamalarını tanımıyor.
2. **StakingRewards `updateReward` modifier'ı (satır 647–648):** `rewardPerTokenStored` ve `lastUpdateTime` her `stake`/`withdraw`/`getReward` çağrısında yazılıyor. Aynı dosyadaki OZ 2.3.0 `ReentrancyGuard` her `nonReentrant` çağrıda `_guardCounter += 1` yapıyor (satır 256). Bu, v4+'daki net-sıfır `_status`'un aksine gerçek bir global sayaç. Kurallar sadece `FunctionDefinition` gövdelerini geziyor; modifier gövdeleri hiç analiz edilmiyor. Bu yüzden skor 100 çıkıyor.

## Güncel sonuçlar (2026-09-26, tüm düzeltmelerden sonra)

Sütunlar sırayla her kural değişikliğinden sonraki heuristic skoru gösterir.

| Kontrat | İlk rapor | P3/P8 (`8c9de2a`) | SafeMath (`8f8f584`) | Modifier + C1 (`d098727`) | Modifier ağırlığı (`6ea243e`) | İç çağrılar (`589dc3d`) | Modifier yazma yeri başına tek bulgu (`554875e`) | Güncel bulgular |
|---|---|---|---|---|---|---|---|---|
| OZ ERC20 | 60 | 60 | 60 | 60 | 60 | 60 | 60 | P3 × 2 `_totalSupply` (512, 527) |
| OZ ERC721 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | yok |
| StakingRewards | 100 | 100 | **70** | 70 | **40** | **0** | **20** | P3 × 3 `_totalSupply` (581, 593, 601); P3 `rewardPerTokenStored` (647, tek bulgu: `updateReward` üzerinden `stakeWithPermit`, `stake`, `withdraw`, `getReward`, `notifyRewardAmount`; ağırlık 1.0); C1 `_guardCounter` (256) |
| UniswapV2Pair | 60 | **100** | **60** | 60 | 60 | **80** | 80 | P3 `totalSupply` (142, `_mint`); P8 `totalSupply` (149, `_burn`); C1 `unlocked` (309); P8 × 4 (355, 356, 358, 359) |
| WETH9 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | yok |
| synthetic/SimpleERC20 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | yok |
| synthetic/SimpleERC721 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | yok |
| synthetic/SimpleStaking | 60 | 60 | 60 | 60 | 60 | 60 | 60 | P3 × 2 `totalStaked` |

Çökme 0, parse hatası 0. Ölçümler aynı: ERC20 harness kritik yol 100, ERC721 harness kritik yol 1; Uniswap V2, WETH9 ve StakingRewards derleyici sürümü yüzünden ölçülmedi.

Beş demo kontratın (BadNFT 40, BadLending 40, AMMPool 100, BrokenDEX 60, ParallelSafe 100) skor ve bulguları altı değişiklikte de aynı kaldı (satır numaraları dahil). Hiçbirinde modifier, `x = x ± c` ya da SafeMath biçimi yok. Ölçümler (ERC20 ve ERC721 harness'leri) kurallardan bağımsız, değişmedi. Sayfada da denendi: StakingRewards ve UniswapV2Pair editöre yüklendi, skor ve bulgular betikle aynı, sözdizimi hatası yok.

## Sınırlamalar

- **Ölçüm sadece solc 0.8.x kontratlarında çalışıyor.** Uygulama npm'deki tek bir solc (0.8.37) kullanıyor. §16 istek anında derleyici indirmeyi yasakladığı için 0.4/0.5 kontratları (Uniswap V2, WETH9, StakingRewards) "Not measured: Compilation failed" dönüyor. Docker imajına birkaç sabit solc sürümü eklenirse bu kalkar.
- **Harness ölçümü tek bir yolu ölçüyor.** ERC20 için mint ölçüldü; `transfer` ölçülemedi, çünkü yer tutucu argümanlarla yeni hesapların bakiyesi yok ve çağrılar revert ediyor.
- **Yer tutucu argümanlar:** `uint` → 1000, `address` → gönderen, `bool` → true. Constructor'ında sözleşme adresi bekleyen kontratlar (StakingRewards) anlamlı deploy edilemiyor.
- **Tek dosya:** Kaynaklar birleştirilmiş olmalı; import desteklenmiyor.
- **Sayı az:** 5 gerçek kontrat, Tier 1 için yeterli ama genelleme için değil. Tier 2'de 15–20'ye çıkarılmalı (§17).

## Düzeltmeler

Yukarıdaki tablo kural değişmeden önceki çıktıdır. Düzeltme, rapordan ayrı bir commit'te yapıldı ("Classify accumulators written alongside pool reserves as P8").

- **P3 / P8:** Rezervleri (P8 değişkenlerini) yazan bir fonksiyondaki `x += amount` birikimleri artık P3 olarak raporlanmıyor. Bunlar P8 (info, Fix yok) olarak, "rezervlerle birlikte yazılıyor, ek çakışma getirmiyor" notuyla raporlanıyor. Rezerv yazmayan fonksiyonlardaki birikimler yine P3. Yeni fixture: `fixtures/solidity/P8_INHERENT.accumulator.sol`.
- **Etkisi:** UniswapV2Pair 60 → **100**; bulgular 4 × P8 (`price0CumulativeLast`, `price1CumulativeLast`, `reserve0`, `reserve1`). Diğer 7 kontratın skor ve bulguları değişmedi. Demo kontratları da değişmedi (BrokenDEX'te rezerv yok).
- **Not:** Heuristic skor 100 olsa da bu havuz tamamen seri çalışır. Çakışma doğal olduğu için P8 skoru düşürmüyor (§5A); bunu gösteren P8 notları ve ölçümdür.

### Yanlış negatif 1: SafeMath / kendine atama ("Recognize SafeMath-style and self-assignment steps in P1 and P3")

- `x = x + c`, `x = c + x`, `x = x - c`, `x = x.add(c)`, `x = x.sub(c)` artık `x += c` / `x -= c` gibi sayılıyor. Sabit adım P1, çağrıya göre değişen miktar P3. P1, P3 ve P8 aynı eşleyiciyi kullanıyor (`lib/analyzer/accumulation.ts`). Fixture'lar: `P1_GLOBAL_COUNTER.safemath.*`, `P3_GLOBAL_ACCUMULATOR.safemath.*`.
- **StakingRewards 100 → 70:** `stake`, `stakeWithPermit` ve `withdraw`'daki `_totalSupply` için P3 × 3. Ağırlıkları 0.5, çünkü bu fonksiyonların modifier'ı var (`nonReentrant`, `updateReward`). `reachability.ts` her modifier'ı "geniş kısıt" sayıyor; bkz. açık işler.
- **UniswapV2Pair 100 → 60:** UniswapV2ERC20'nin `_mint`/`_burn`'ündeki `totalSupply = totalSupply.add/sub(value)` artık P3. Bu, likidite ekleme/çıkarma yolu için gerçek bir okuma-yazma. Ancak bu yolu çağıran `mint`/`burn` zaten `_update` üzerinden rezervlerde sıraya giriyor. P3'ün "rezervlerle aynı fonksiyon" istisnası iç çağrıları takip etmediği için bunu göremiyor. OZ ERC20 `_update` ile aynı durum: yanlış değil ama skoru abartıyor.

### Yanlış negatif 2: modifier gövdeleri ("Scan modifier bodies; report reentrancy guards as C1 info")

- Kurallar artık bir fonksiyonun çağırdığı modifier'ların gövdelerini de tarıyor. Modifier aynı dosyada çözülüyor: önce aynı kontrat, sonra base kontratlar. Bulgular fonksiyonun adını ve ağırlığını taşıyor, mesajda "via modifier `m`" yazıyor. P1, P2, P3 ve P8 bunu kullanıyor.
- Reentrancy guard yazmaları (`nonReentrant`, `lock`, `mutex` ya da `_status`/`_guardCounter`/`unlocked`) yeni **`C1_REENTRANCY_GUARD`** kuralıyla raporlanıyor (CLAUDE.md §5C'ye eklendi). Kural info seviyesinde, Fix önermiyor, `ReentrancyGuardTransient` öneriyor ve çakışma iddia etmiyor. P1/P3 bu yazmaları atlıyor. Fixture'lar: `P1_GLOBAL_COUNTER.modifier.*`, `C1_REENTRANCY_GUARD.*`.
- **StakingRewards:** `_guardCounter += 1` artık C1 (info; `stakeWithPermit`, `stake`, `withdraw`, `getReward`). Skor 70'te kaldı. Not: OZ 2.x'teki bu sayaç, v4+'daki net-sıfır `_status`'un aksine her çağrıda artıyor. Yani gerçekte bir global sayaç, ama §5C gereği ölçülmeden çakışma sayılmıyor. 0.5.16 olduğu için şu an ölçülemiyor.
- **UniswapV2Pair:** `lock` modifier'ındaki `unlocked` artık C1 (info; `mint`, `burn`, `swap`, `skim`, `sync`). Skor 60'ta kaldı.

### Modifier ağırlığı ("Weigh functions by whether their modifiers check the caller")

- Bir modifier artık yalnızca gövdesi ya da çağırdığı bir iç fonksiyon çağıranı kontrol ediyorsa kısıtlama sayılıyor (0.5). Kontrol, `require`/`assert`/`if` içinde `msg.sender`, `_msgSender()` ya da `tx.origin` olarak aranıyor. `nonReentrant`, `whenNotPaused`, `updateReward` gibi modifier'lar fonksiyonu 1.0'da bırakıyor. Admin tespiti (§5C) aynı; dosyada tanımı olmayan modifier'lar 0.5'te kalıyor. Fixture: `REACHABILITY.modifiers.sol`.
- **StakingRewards 70 → 40:** üç `_totalSupply` P3'ü artık 1.0 ağırlıkta.

### İç çağrılar, bir seviye ("Follow internal calls one level for P3/P8")

- **Rezerv bağlamı:** Aşağıdaki durumlarda birikim P3 değil P8 (info) oluyor. Mesaj yolu da söylüyor.
  - Fonksiyon rezervleri kendisi yazıyorsa,
  - bir iç çağrıyla yazdırıyorsa,
  - ya da internal olup dosyadaki bütün çağıranları bunlardan biriyse.
  
  Fixture'lar: `P8_INHERENT.calls.*`.
- **`x = f()`:** `f` kontratın bir view/internal fonksiyonuysa ve `x`'i okuyorsa bu bir okuma-yazma; P3. Fixture'lar: `P3_GLOBAL_ACCUMULATOR.derived.*`.
- **UniswapV2Pair 60 → 80:** `_burn`'deki `totalSupply` P8 oldu (tek çağıran `burn`, o da `_update`'i çağırıyor). `_mint`'teki P3 kaldı: `_mint`'i `mint`'in yanında `_mintFee` de çağırıyor. `_mintFee` rezervleri kendisi yazmıyor, ancak kendi çağıranı `mint` üzerinden, yani iki seviyede ulaşıyor. Bir seviye sınırının sonucu.
- **StakingRewards 40 → 0:** `rewardPerTokenStored = rewardPerToken()` P3 oldu. `updateReward`'ı kullanan her fonksiyon için ayrı sayıldığı için ceza büyük (4 × 20 + 1 × 10) ve skor 0'a kırpıldı.
- **OZ ERC20:** Değişmedi. Rezerv olmadığı için `_totalSupply` P3 kaldı; ölçüm de kritik yol 100 gösteriyor.

### Paylaşılan modifier: yazma yeri başına tek bulgu ("One finding per write site in a shared modifier")

- Birden fazla fonksiyonun kullandığı bir modifier'daki yazma artık yazma yeri başına tek bulgu. Ağırlığı, onu çalıştıran fonksiyonların en yükseği; mesajda hepsi listeleniyor. Örnek: "in stakeWithPermit, stake, withdraw, getReward, notifyRewardAmount (via modifier `updateReward`)". `C1_REENTRANCY_GUARD` zaten böyle çalışıyordu.
- Fonksiyon gövdelerindeki yazmaların sayımı değişmedi: her fonksiyon ayrı bulgu. Sadece admin fonksiyonlarının kullandığı bir modifier'ın en yüksek ağırlığı 0.05 olduğu için P1–P5 bulgusu yine düşürülüyor (§5C). Fixture: `P3_GLOBAL_ACCUMULATOR.shared-modifier.sol`.
- **StakingRewards 0 → 20:** `rewardPerTokenStored` artık 5 değil 1 bulgu (100 − 3 × 20 − 20).

### Hâlâ açık

- **`lastUpdateTime` statik kurallarla yakalanmıyor, ölçümle yakalanıyor.**
  - StakingRewards'ta `lastUpdateTime = lastTimeRewardApplicable()` (satır 648) `x = f()` kuralına girmiyor, çünkü `f` `lastUpdateTime`'ı okumuyor. Ama aynı modifier'da ondan önce çağrılan `rewardPerToken()` onu okuyor; yani slot her çağrıda okunuyor ve yazılıyor. Bunun için ayrı bir statik kural eklenmedi (karar).
  - Ölçüm bunu gösteriyor. StakingRewards 0.5.16 olduğu için doğrudan ölçülemiyor. Bu yüzden ödül muhasebesini 0.8'e taşıyan küçük bir kopya ölçüldü: `fixtures/measure/StakingRewardsCore.sol` (`updateReward` aynı; token transferi yok). 100 ayrı gönderenle `stake()` sonucu:
    - kritik yol 100, yeniden çalıştırma 99;
    - sıcak slotlar: `_totalSupply` (100 yazan, 100 okuyan; statik P3 tahmin etmişti) ve `lastUpdateTime` (1 yazan, 100 okuyan).
  - Sayfa `lastUpdateTime`'ı **"Not caught by static rules"** bölümünde gösteriyor (tarayıcıda denendi).
  - Aynı ölçümde `rewardPerTokenStored` sıcak değil. Bloktaki bütün işlemler aynı `block.timestamp`'i görüyor, bu yüzden değer blok içinde değişmiyor ve diffMode bunu yazma saymıyor. Yani statik P3 (`x = f()`) bu tek blok senaryosunda ölçümle doğrulanmıyor; farklı zaman damgalı işlemlerde değer değişir. Monad'da birden fazla blok aynı `block.timestamp`'i paylaşabildiği için (§9) bu durum orada da görülebilir.
- **İki seviye:** UniswapV2ERC20 `_mint`, `_mintFee` üzerinden rezervlere iki seviyede ulaşıyor ve P3 kalıyor (UniswapV2Pair 80).
- **İç fonksiyon bulguları "every caller" diyor.** OZ ERC20 `_update`'te `transfer` `_totalSupply`'a dokunmuyor, sadece mint/burn dalları dokunuyor.
