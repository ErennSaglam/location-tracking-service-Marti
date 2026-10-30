# Testler

Bu doküman üç şeyi anlatır: testlerin nasıl çalıştırılacağını, sonuçların nasıl okunacağını ve performans ölçümlerinde neler bulunduğunu. Kurulum ve endpoint'ler için: [README.md](README.md).

Başlamadan önce [README'deki kurulum adımlarını](README.md#2-kurulum-ve-çalıştırma) tamamlayın. Bu adımlarda kütüphaneler kurulur (`npm ci`) ve ayar dosyası (`.env`) oluşturulur.

**Hangi ortamda denendi:** Bu dokümandaki bütün komutlar sadece macOS'ta (Apple Silicon işlemcili MacBook) çalıştırıldı. Windows'ta ve Linux'ta denenmedi.

<a id="icindekiler"></a>

## İçindekiler

- [Kavramlar](#kavramlar)
1. [Unit ve e2e testler](#1-unit-ve-e2e-testler)
2. [Performans testi (k6)](#2-performans-testi-k6)
   - [2.1 Neden yük testi yaptık](#21-neden-yük-testi-yaptık)
   - [2.2 Ölçülen değerler](#22-ölçülen-değerler)
   - [2.3 Test senaryosu](#23-test-senaryosu)
   - [2.4 Hazırlık](#24-hazırlık)
   - [2.5 Testi çalıştırma](#25-testi-çalıştırma)
   - [2.6 Çıktı nasıl okunur](#26-çıktı-nasıl-okunur)
   - [2.7 Sonuçlar](#27-sonuçlar)
3. [Performans: yavaşlığın araştırılması ve testin sınırları](#3-performans-yavaşlığın-araştırılması-ve-testin-sınırları)
   - [3.1 Yavaşlığın kaynağı nasıl bulundu](#31-yavaşlığın-kaynağı-nasıl-bulundu)
   - [3.2 Ne değişti, sonuç ne oldu](#32-ne-değişti-sonuç-ne-oldu)
   - [3.3 Testin sınırları](#33-testin-sınırları)

---

## Kavramlar

Bu dokümanda geçen terimler. Bilinenleri atlayabilirsiniz. Docker, container, migration ve transaction gibi genel kavramlar [README'nin 1. bölümünde](README.md#1-temel-kavramlar) anlatılır.

**Testler**

| Terim | Anlamı |
|---|---|
| **Unit test** (birim testi) | Kodun tek bir parçasını, uygulamanın geri kalanı ve veritabanı olmadan test eder. Örnek: "Kullanıcı önce A alanındaydı, şimdi A ve B alanında. Yeni giriş sadece B mi?" |
| **e2e test** (uçtan uca test) | Uygulamanın tamamını gerçek bir veritabanıyla çalıştırır ve gerçek HTTP istekleri gönderir. API'yi bir kullanıcı gibi kullanır. |
| **Vitest** | Testleri bulan, çalıştıran ve sonucu raporlayan test aracı. |
| **Testcontainers** | e2e testler için Docker'da geçici bir veritabanı açan kütüphane. Test bitince veritabanını siler. |

**Yük testi**

| Terim | Anlamı |
|---|---|
| **Yük testi** | Sisteme aynı anda çok sayıda istek gönderip yoğun trafikte nasıl davrandığını ölçmek. |
| **k6** | Yük testi aracı. Grafana Labs geliştirir, ücretsiz ve açık kaynaktır. |
| **Sanal kullanıcı** | k6'nın çalıştırdığı, bir telefonu taklit eden küçük program. Her sanal kullanıcı belirli aralıklarla API'ye konum gönderir. |
| **Yanıt süresi** | Bir isteğin gönderilmesinden cevabın gelmesine kadar geçen süre. |
| **RPS** (requests per second) | Saniyede işlenen istek sayısı. |
| **p50, p95, p99** | Yanıt sürelerinin sıralamadaki yeri. Ayrıntı: [2.2](#22-ölçülen-değerler). |
| **ms** | Milisaniye. 1 saniye = 1.000 ms. |

**Veritabanı ve uygulama içi**

| Terim | Anlamı |
|---|---|
| **Sorgu / gidip gelme** | Uygulamanın veritabanına gönderdiği her komut. Uygulama komutu gönderir ve cevabı bekler. Her sorgu bir gidip gelme demektir. |
| **Satır kilidi** | Veritabanında bir satırı geçici olarak kilitlemek. Aynı satırı kilitlemek isteyen ikinci istek, ilki bitene kadar bekler. Bu projede her kullanıcının durum satırı, konum işlenirken kilitlenir. |
| **Bağlantı havuzu** (connection pool) | Uygulamanın veritabanına önceden açtığı bağlantılar. Bu projede 20 bağlantı var. Her istek havuzdan bir bağlantı alır, işi bitince geri verir. 20 bağlantının hepsi doluysa yeni istek sırada bekler. |
| **Event loop** (ana iş hattı) | Node.js gelen işleri tek bir hatta sırayla işler. Bu hat çok doluysa işler sırada bekler ve uygulama yavaşlar. |
| **Index** | Veritabanının bütün tabloyu okumadan aradığını bulmasını sağlayan yapı. Kitabın sonundaki dizine benzer. |
| **REINDEX** | Index'i baştan oluşturan PostgreSQL komutu. Silinen kayıtların index'te bıraktığı boş yeri temizler. |
| **Checkpoint** | PostgreSQL değişiklikleri önce bellekte tutar, belirli aralıklarla toplu olarak diske yazar. Bu toplu yazmaya checkpoint denir. Checkpoint sırasında veritabanı kısa süre yavaşlayabilir. |
| **Keep-alive** | Bir istek bittikten sonra HTTP bağlantısını kapatmamak ve aynı bağlantıyı sonraki istek için kullanmak. Her istekte yeni bağlantı açma maliyeti olmaz. |

[↑ İçindekiler](#icindekiler)

---

## 1. Unit ve e2e testler

Komutlar her işletim sisteminde aynı yazılır. Bu testler için uygulamayı başlatmanız gerekmez. Sadece Docker Desktop açık olmalıdır, çünkü e2e testler kendi veritabanlarını Docker'da açar.

**Unit testler** (birkaç saniye sürer):

```bash
npm test
```

**e2e testler.** İlk çalıştırma yaklaşık 1 dakika sürer, çünkü Docker veritabanı image'ını indirir. Sonraki çalıştırmalar yaklaşık 10 saniye sürer.

```bash
npm run test:e2e
```

e2e testler sizin veritabanınızı (`location-tracking-postgres`) kullanmaz. Her çalıştırmada geçici bir veritabanı açılır, tablolar oluşturulur ve test bitince bu veritabanı silinir.

Başarılı bir çalıştırmanın sonunda şu satırlar görünür:

| Komut | Beklenen çıktı |
|---|---|
| `npm test` | `Test Files  2 passed (2)` ve `Tests  23 passed (23)` |
| `npm run test:e2e` | `Test Files  4 passed (4)` ve `Tests  16 passed (16)` |

`Test Files` çalışan test dosyası sayısıdır, `Tests` çalışan test sayısıdır. `passed` başarılı demektir. `failed` yazan bir satır varsa, hangi testin neden başarısız olduğu hemen üstünde yazar.

### Unit testler neyi doğruluyor

- **Giriş kuralları** ([`location-update.policy.spec.ts`](src/locations/location-update.policy.spec.ts)): Bir konumun eski mi, tekrar mı, çelişkili mi olduğuna karar veren kurallar. Bir de yeni girilen alanların hesabı.
- **Hata kodları** ([`to-http-exception.spec.ts`](src/common/filters/to-http-exception.spec.ts)): Veritabanı hatalarının doğru HTTP koduna çevrilmesi. Örnek: veritabanına bağlanılamıyorsa API `500` değil `503` ("geçici olarak hizmet veremiyorum, tekrar deneyin") döner.

### e2e testler neyi doğruluyor

Testlerde üç alan kullanılır:

- **Outer:** Büyük kare alan.
- **Inner:** Outer'ın tamamen içinde küçük kare alan.
- **Overlapping:** Yarısı Outer'ın üstüne binen kare alan.

| Test | Ne yapılıyor (örnek) | Neden | Beklenen sonuç |
|---|---|---|---|
| **Alanlar** ([`areas.e2e-spec.ts`](test/areas.e2e-spec.ts)) | Outer, Inner ve Overlapping oluşturulur. Sonra üç hatalı alan gönderilir: kenarları kesişen papyon (`⋈`) şekli, ilk ve son noktası aynı olmayan (kapanmamış) şekil ve aynı isimle ikinci bir alan. | İç içe ve örtüşen alanlar geçerli olmalı. Hatalı şekiller veritabanına girmemeli. | Üç alan oluşur (`201`). Papyon ve kapanmamış şekil `400` alır. Papyonun hata mesajı `Invalid polygon: Self-intersection` olur. Aynı isim `409` alır. |
| **Hareket senaryosu** ([`locations.e2e-spec.ts`](test/locations.e2e-spec.ts)) | Kullanıcı sırayla şu konumları gönderir: dışarıda → Outer'a girer → Outer'da kalır → Inner'a geçer → Outer ile Overlapping'in kesiştiği yere geçer → dışarı çıkar → Outer'a tekrar girer. | Sadece **yeni** girişler kaydedilmeli. Kullanıcı bir alanın içinde kaldıkça yeni kayıt oluşmamalı. Çıkıp tekrar girerse yeni kayıt oluşmalı. | Tam 4 giriş kaydı: Outer, Inner, Overlapping ve tekrar Outer. "Outer'da kalır" adımı kayıt üretmez. |
| **Eski / tekrar / çelişen konum** | 1) Saat 09:00:10'da Outer'dan konum gelir. 2) Aynı konum aynı saatle tekrar gelir. 3) Saat 09:00:05'li (daha eski) bir Inner konumu gelir. 4) Saat 09:00:10'lu ama farklı bir konum gelir. | Telefonlar ağ sorunlarında aynı konumu tekrar gönderebilir veya eski konumu geç gönderebilir. Bunlar kullanıcının durumunu bozmamalı. | 2. istek `duplicate_ignored` döner. 3. istek `stale_ignored` döner ve kullanıcı Inner'a taşınmaz. 4. istek `409` alır, çünkü aynı anda iki farklı yerde olamaz. Toplam 1 giriş kaydı oluşur. |
| **Eşzamanlılık** (aynı anda gelen istekler) | Aynı kullanıcı için, saatleri farklı 20 konum **aynı anda** gönderilir. Hepsi Outer'ın içinde. | Kilit olmasaydı 20 isteğin hepsi kullanıcıyı "dışarıda" görür ve her biri bir giriş kaydı yazardı. Bu test satır kilidinin çalıştığını kanıtlar. | 20 isteğin hepsi `200` alır ama sadece **1** giriş kaydı oluşur. |
| **Doğrulama** | Enlemi 95 olan konum (geçerli aralık -90 ile 90), saat dilimi olmayan zaman ve 10 dakika ileri tarihli zaman gönderilir. | Hatalı veri işlenmemeli. | Üçü de `400` alır. |
| **Giriş kayıtları** ([`logs.e2e-spec.ts`](test/logs.e2e-spec.ts)) | Kayıtlar sayfa sayfa okunur, `userId` ve `areaId` ile filtrelenir, hatalı parametre gönderilir. | Sayfalama kayıt atlamamalı veya tekrarlamamalı. | Bütün kayıtlar en yeniden eskiye, birer kez gelir. Filtreler doğru çalışır. Hatalı parametre `400` alır. |
| **Hatalı girdiler** ([`errors.e2e-spec.ts`](test/errors.e2e-spec.ts)) | Veritabanının saklayamayacağı değerler gönderilir: çok büyük sayı, görünmez NUL karakteri, aralık dışı tarih, sadece boşluktan oluşan isim. | Bu değerler daha önce veritabanına ulaşıp `500` hatasına yol açıyordu. | Hepsi veritabanına ulaşmadan `400` alır. |
| **Veritabanı kesintisi** | Test sırasında veritabanı container'ı durdurulur. Ardından `POST /locations`, `GET /logs` ve `GET /health` çağrılır. | Veritabanı geçici olarak kapalıysa istemci "tekrar dene" bilgisini almalı. | Üçü de `500` yerine `503` döner. |

**Güvenlik önlemi:** e2e testler her testten önce tabloları temizler. Bu temizliğin yanlışlıkla sizin veritabanınızda yapılmaması için testler önce özel bir işaret tablosu arar. Bu tablo sadece test veritabanında oluşturulur. Tablo yoksa temizlik yapılmaz.

**e2e testler başlamıyorsa:** `Could not find a working container runtime strategy` hatası Docker'ın çalışmadığını gösterir. Docker Desktop'ı açın. Sonra `docker ps` komutunu çalıştırın. Komut hata vermiyorsa testleri tekrar başlatın.

[↑ İçindekiler](#icindekiler)

---

## 2. Performans testi (k6)

### 2.1 Neden yük testi yaptık

Task, kullanıcı sayısının ve trafiğin zamanla çok artabileceğini söylüyor. "Sistem bu yükü kaldırır" demek yerine bunu ölçtük.

Hedefi şöyle hesapladık: Her kullanıcı 5 saniyede bir konum gönderirse, 10.000 aktif kullanıcı saniyede 2.000 istek demektir (10.000 / 5 = 2.000).

Yük testi iki şeyi ölçer:

- **Hız:** İstekler ne kadar sürede cevaplanıyor?
- **Doğruluk:** Yoğun trafikte giriş kaydı kayboluyor veya iki kez yazılıyor mu?

[↑ İçindekiler](#icindekiler)

### 2.2 Ölçülen değerler

| Değer | Anlamı | Örnek |
|---|---|---|
| **RPS** | Saniyede işlenen istek sayısı | `184` → saniyede 184 konum işlendi |
| **p50** | İsteklerin yarısı bu süreden kısa sürdü. "Tipik" bir isteğin süresidir. | `p50 = 4 ms` → isteklerin yarısı 4 ms'den kısa sürdü |
| **p95** | 100 isteğin 95'i bu süreden kısa sürdü. Yavaş isteklerin ne kadar yavaş olduğunu gösterir. | `p95 = 19 ms` → 100 istekten sadece 5'i 19 ms'den uzun sürdü |
| **p99** | 100 isteğin 99'u bu süreden kısa sürdü. En yavaş %1'lik dilimin sınırıdır. | `p99 = 28 ms` → 100 istekten sadece 1'i 28 ms'den uzun sürdü |
| **Hata oranı** | Başarılı cevap (`200`) alamayan isteklerin oranı | `0` → hiçbir istek başarısız olmadı |
| **Log tutarlılığı** | Test sonunda veritabanındaki giriş kaydı sayısının beklenen sayıyla aynı olup olmadığı | `6.000 / 6.000` → beklenen 6.000 kaydın hepsi var, fazlası yok |

**Neden ortalama değil de p95 ve p99?** Ortalama, az sayıdaki çok yavaş isteği gizler. Örnek:

- 100 istekten 99'u 1 ms sürüyor, 1'i 1 saniye (1.000 ms) sürüyor.
- Ortalama: (99 × 1 + 1.000) / 100 ≈ 11 ms. Sistem hızlı görünür.
- p99 ise 1.000 ms gösterir. Yani bazı kullanıcılar 1 saniye bekliyor.

[↑ İçindekiler](#icindekiler)

### 2.3 Test senaryosu

Senaryo dosyası: [`load/locations.js`](load/locations.js). Bu dosya k6'ya hangi istekleri, hangi sırayla göndereceğini söyler.

**Alanlar.** Test başlarken API üzerinden 101 alan oluşturulur:

- `k6-City`: Ankara'da büyük bir kare alan.
- `k6-cell-0-0` ... `k6-cell-9-9`: `k6-City`'nin içinde 10 × 10 = 100 küçük kare hücre.

Alanlar README örneklerinden (İstanbul) uzakta seçildi. Böylece Swagger'da elle oluşturduğunuz alanlar test sonucunu etkilemez. Alanlar önceki bir testten kaldıysa yeniden oluşturulmaz, aynıları kullanılır.

**Bir sanal kullanıcının yaptığı.** Her sanal kullanıcı 4 adımı sırayla tekrarlar:

| Adım | Konum | Beklenen giriş kaydı |
|---|---|---|
| 1 | Bütün alanların dışında | 0 |
| 2 | Bir hücrenin içinde, örneğin `k6-cell-3-7` | **2**: `k6-City` ve `k6-cell-3-7`. Hücre `k6-City`'nin içinde olduğu için kullanıcı ikisine birden girmiş olur. |
| 3 | Aynı hücrenin içinde, biraz farklı bir nokta | 0. Kullanıcı zaten hücrenin içinde, yeni giriş yok. |
| 4 | Bütün alanların dışında | 0. Çıkış kaydedilmez. |

Sonra kullanıcı 1. adıma döner. Yani her 4 adımda 2 giriş kaydı oluşmalıdır.

**Örnek hesap:** 1.000 kullanıcı, 1 dakika. Her kullanıcı 5 saniyede bir konum gönderir. 1 dakikada her kullanıcı 12 konum gönderir ve 4 adımlık turu 3 kez tamamlar. 3 tur × 2 kayıt = kullanıcı başına 6 kayıt. 1.000 kullanıcı × 6 = **6.000 giriş kaydı** beklenir.

**İki test türü var:**

| Tür | Ne yapar | Ne zaman kullanılır | Örnek |
|---|---|---|---|
| **`users`** (gerçekçi kullanım) | Belirtilen sayıda sanal kullanıcı açılır. Her biri 5 saniyede bir konum gönderir. İlk istekler 0–5 saniyeye yayılır, böylece herkes aynı anda başlamaz. Sistem yavaşlarsa kullanıcılar da cevap bekledikleri için yavaşlar. | Gerçek kullanımı taklit etmek için | `users 1000` → 1.000 kullanıcı, saniyede yaklaşık 200 istek |
| **`rate`** (sabit hız) | Sistem ne kadar yavaşlarsa yavaşlasın, k6 saniyede tam olarak belirtilen sayıda istek gönderir. İstekler belirtilen sayıda kullanıcıya dağıtılır. | Sistemin belirli bir hızı kaldırıp kaldıramadığını görmek için | `rate 10000 ... 2000` → 10.000 farklı kullanıcı adına saniyede 2.000 istek |

[↑ İçindekiler](#icindekiler)

### 2.4 Hazırlık

Yük testi, sizin çalıştırdığınız uygulamaya ve veritabanına istek gönderir. Bu yüzden test başlamadan önce şu üç şey hazır olmalıdır:

**1. Veritabanı çalışıyor olmalı.** [README'deki kurulumu](README.md#22-adım-adım-çalıştırma) yaptıysanız veritabanı zaten çalışıyordur. Kontrol etmek için:

```bash
docker ps --filter name=location-tracking-postgres
```

Çıktıda `location-tracking-postgres` satırı ve `Up` yazısı görünmelidir. Görünmüyorsa veritabanını başlatın:

```bash
npm run db:up
```

**2. Tablolar oluşturulmuş olmalı.** Kurulumda `npm run migration:run` çalıştırdıysanız bu adımı atlayın. Emin değilseniz komutu tekrar çalıştırın. Tablolar zaten varsa komut hiçbir şeyi değiştirmez.

```bash
npm run migration:run
```

**3. Uygulama canlı ortam modunda çalışıyor olmalı.** Yeni bir terminal açın ve şu iki komutu sırayla çalıştırın. Bu terminali test boyunca açık bırakın.

```bash
npm run build
```

```bash
npm run start:prod
```

- `npm run build`: TypeScript kodunu Node.js'in çalıştırabileceği JavaScript'e çevirir. Sonuç `dist/` klasörüne yazılır.
- `npm run start:prod`: `dist/` klasöründeki uygulamayı başlatır.

Neden `npm run start:dev` değil? Geliştirme modu dosya değişikliklerini izler ve kodu sürekli yeniden derler. Bu ek iş ölçümü bozar. Canlı ortam modu, uygulamanın gerçek sunucuda çalıştığı moddur.

**Kontrol:** Tarayıcıda http://localhost:3000/health adresini açın. `"status":"ok"` görünmelidir.

[↑ İçindekiler](#icindekiler)

### 2.5 Testi çalıştırma

İki yöntem var:

| Yöntem | Ne gerekir | Kimin için |
|---|---|---|
| **1. Docker ile** (önerilen) | Sadece Docker. Bilgisayara başka program kurulmaz. | Herkes. Bütün işletim sistemlerinde aynı komut kullanılır. |
| **2. Hazır script ile** (isteğe bağlı) | k6 ve `jq` programlarının bilgisayara kurulması | Sadece macOS. Testle birlikte CPU ve bellek kullanımını da ölçmek isteyenler için. |

<a id="yontem-1-docker"></a>

#### Yöntem 1 — Docker ile (kurulum gerekmez)

k6'nın resmi Docker image'ı (`grafana/k6`) kullanılır. k6 bilgisayara kurulmaz. Docker, k6'yı bir container içinde çalıştırır ve test bitince container'ı siler. İlk çalıştırmada Docker image'ı indirir. Bu birkaç saniye sürer.

Komutları projenin ana klasöründe çalıştırın (`package.json` dosyasının bulunduğu klasör). macOS'ta denendi. Windows'ta ve Linux'ta denenmedi.

**Adım 1. Önceki testlerin verisini temizleyin.** Bu komut sadece yük testi kullanıcılarının kayıtlarını siler (`users` veya `rate` ile başlayan kullanıcılar). Swagger'da elle oluşturduğunuz kayıtlara dokunmaz.

```bash
docker exec location-tracking-postgres psql -U location -d location_tracking -c "DELETE FROM area_entry_logs WHERE user_id ~ '^(users|rate)[0-9]'; DELETE FROM user_location_states WHERE user_id ~ '^(users|rate)[0-9]';"
```

Ekranda `DELETE 0` gibi iki satır görünür. Sayı, silinen kayıt sayısıdır. İlk çalıştırmada `0` olması normaldir.

**Adım 2. Testi çalıştırın** (1.000 kullanıcı, 1 dakika).

macOS ve Linux:

```bash
docker run --rm -v "$(pwd):/work" -w /work grafana/k6:2.3.0 run -e BASE_URL=http://host.docker.internal:3000 -e MODE=users -e USERS=1000 -e DURATION=1m -e RUN_ID=users1000test load/locations.js
```

Windows PowerShell (tek fark `$(pwd)` yerine `${PWD}`):

```powershell
docker run --rm -v "${PWD}:/work" -w /work grafana/k6:2.3.0 run -e BASE_URL=http://host.docker.internal:3000 -e MODE=users -e USERS=1000 -e DURATION=1m -e RUN_ID=users1000test load/locations.js
```

Komutun parçaları:

| Parça | Anlamı |
|---|---|
| `docker run --rm` | Bir container başlatır. `--rm`, container'ı iş bitince siler. |
| `-v "$(pwd):/work" -w /work` | Proje klasörünü container'ın içinde `/work` olarak açar. k6 senaryo dosyasını buradan okur. Sonuç dosyasını da `load/results/` klasörüne buradan yazar. |
| `grafana/k6:2.3.0` | k6'nın resmi Docker image'ı, 2.3.0 sürümü. |
| `BASE_URL=http://host.docker.internal:3000` | k6'nın istek göndereceği adres. Container'ın içinden bakınca `localhost` container'ın kendisidir. Sizin bilgisayarınızdaki uygulamaya `host.docker.internal` adresiyle ulaşılır. |
| `MODE=users` | Test türü: `users` veya `rate` ([2.3](#23-test-senaryosu)). |
| `USERS=1000` | Sanal kullanıcı sayısı. |
| `DURATION=1m` | Test süresi. `30s` = 30 saniye, `1m` = 1 dakika, `5m` = 5 dakika. |
| `RUN_ID=users1000test` | Bu teste verdiğiniz isim. Test kullanıcılarının adı bu isimle başlar (`users1000test-u1`, `users1000test-u2`, ...). İsim `users` veya `rate` ile başlayıp bir rakamla devam etmelidir. Yoksa Adım 1'deki temizlik komutu bu kayıtları silmez. |

Test bitince ekrana sonuç özeti gelir ([2.6](#26-çıktı-nasıl-okunur)). Aynı özet `load/results/users1000test.json` dosyasına da yazılır.

**Adım 3. Veritabanındaki giriş kaydı sayısını kontrol edin.** Bu komut, bu testin kullanıcılarına ait giriş kayıtlarını sayar:

```bash
docker exec location-tracking-postgres psql -U location -d location_tracking -c "SELECT count(*) FROM area_entry_logs WHERE user_id LIKE 'users1000test-%';"
```

Bu sayı, özetteki `entriesReported` değerine eşit olmalıdır.

**Sabit hız testi** (saniyede 2.000 istek, 10.000 kullanıcı, 1 dakika). Adım 2 ve 3'te şu komutları kullanın. `RATE`, saniyedeki istek sayısıdır. Windows'ta `$(pwd)` yerine `${PWD}` yazın.

```bash
docker run --rm -v "$(pwd):/work" -w /work grafana/k6:2.3.0 run -e BASE_URL=http://host.docker.internal:3000 -e MODE=rate -e USERS=10000 -e RATE=2000 -e DURATION=1m -e RUN_ID=rate2000test load/locations.js
```

```bash
docker exec location-tracking-postgres psql -U location -d location_tracking -c "SELECT count(*) FROM area_entry_logs WHERE user_id LIKE 'rate2000test-%';"
```

**Testi tekrar çalıştırmadan önce:**

1. Adım 1'i tekrarlayın. Yoksa Adım 3'teki sayıya önceki testin kayıtları da eklenir.
2. Önceki test bittikten sonra **en az 45 saniye bekleyin.** Test bitince k6'nın kullandığı bağlantı portları 30 saniye boyunca boşa çıkmaz. Hemen yeni bir test başlatılırsa k6 bağlantı açamaz ve isteklerin bir kısmı başarısız olur. Ayrıntı: [3.3](#33-testin-sınırları).

**Olası sorunlar:**

| Belirti | Sebep ve çözüm |
|---|---|
| `connection refused` veya `Area setup failed` | Uygulama çalışmıyor. [2.4'teki 3. adımı](#24-hazırlık) yapın ve http://localhost:3000/health adresini kontrol edin. |
| Çıktıda `can't assign requested address` uyarısı ve %10'dan fazla hata | Test, önceki test bittikten hemen sonra başlatıldı. 45 saniye bekleyip testi tekrarlayın. |
| Linux'ta `host.docker.internal` bulunamıyor | Linux'ta bu adres kendiliğinden tanımlı değildir. `docker run` komutuna `--add-host=host.docker.internal:host-gateway` ekleyin. |
| Uygulamanın portunu değiştirdiniz ([README, 2.4](README.md#24-port-doluysa)) | Komuttaki `:3000` yerine kendi portunuzu yazın. Örnek: `BASE_URL=http://host.docker.internal:3001`. |

<a id="yontem-2-script"></a>

#### Yöntem 2 — Hazır script ile (isteğe bağlı, sadece macOS)

Bu yöntem testle birlikte uygulamanın, veritabanının ve k6'nın CPU ve bellek kullanımını da ölçer. Test bitince giriş kayıtlarını kendisi sayar ve karşılaştırır. Bu ölçümler için macOS'a özgü komutlar kullanıldığı için sadece macOS'ta çalışır.

Bu yöntem için k6 ve `jq` bilgisayara kurulmalıdır. `jq`, script'in k6 sonuç dosyasını okumak için kullandığı küçük bir araçtır. Kurulum için [Homebrew](https://brew.sh) gerekir:

```bash
brew install k6 jq
```

Önce önceki testlerin verisini temizleyin. Ekranda `load data reset` yazar:

```bash
load/reset-load-data.sh
```

Sonra testi çalıştırın. 1.000 kullanıcı, 1 dakika:

```bash
load/run-scenario.sh users 1000 1m
```

Saniyede 2.000 istek, 10.000 kullanıcı, 1 dakika:

```bash
load/run-scenario.sh rate 10000 1m 2000
```

Parametrelerin sırası: `users <kullanıcı sayısı> <süre>` ve `rate <kullanıcı sayısı> <süre> <saniyedeki istek>`.

Uygulamanın portunu değiştirdiyseniz komutun başına portu yazın: `PORT=3001 load/run-scenario.sh users 1000 1m`.

Test sırasında bilgisayarda bu uygulamanın sadece bir kopyası çalışmalıdır. Script CPU ve bellek ölçümü için bulduğu ilk `node dist/main` işlemini kullanır. İki kopya çalışıyorsa yanlış kopyayı ölçebilir. Bu durumda uygulamanın CPU değeri 0 çıkar. Test ve giriş kaydı kontrolü yine doğru çalışır.

<a id="testler-çok-sayıda-tekrardan-sonra-yavaşladıysa"></a>

#### Testler çok sayıda tekrardan sonra yavaşladıysa

Her temizlik test kayıtlarını siler. Ama silinen kayıtların index'teki yeri hemen boşalmaz. Test çok kez tekrarlanırsa index'ler büyür ve testler yavaşlar.

Bu doküman kontrol edilirken bu durum yaşandı. Saniyede 2.000 istek testinde p50 normalde 0,8 ms iken 888 ms çıktı. Giriş kaydı sayısı yine doğruydu, yani sadece hız etkilendi.

Çözüm: index'leri yeniden oluşturun. Bu komut kayıtları silmez, sadece index'leri küçültür. Ekranda iki kez `REINDEX` yazar.

```bash
docker exec location-tracking-postgres psql -U location -d location_tracking -c "REINDEX TABLE area_entry_logs; REINDEX TABLE user_location_states;"
```

Bu komuttan sonra aynı testte p50 tekrar 0,8 ms oldu.

[↑ İçindekiler](#icindekiler)

### 2.6 Çıktı nasıl okunur

Test bitince ekrana önce k6'nın kendi özeti, en sonda da bu proje için hazırlanan özet gelir. Aşağıdaki örnek 1.000 kullanıcı testinden alındı. Gerçek çıktıda bağlantı süreleri gibi başka alanlar da vardır.

```json
{
  "rps": 184.07,
  "failedRate": 0,
  "latencyMs": { "p50": 4.37, "p95": 19.18, "p99": 27.6, "max": 216 },
  "processed": 11986,
  "staleIgnored": 0,
  "duplicateIgnored": 0,
  "entriesReported": 6000,
  "entryStepsProcessed": 3000
}
```

| Alan | Anlamı | Bu örnekte |
|---|---|---|
| `rps` | Saniyede işlenen istek | Saniyede 184 istek |
| `failedRate` | Başarısız isteklerin oranı | `0`: hiç hata yok |
| `latencyMs` | Yanıt süreleri (ms). `max` en yavaş isteğin süresidir. | Tipik istek 4,4 ms, en yavaş istek 216 ms |
| `processed` | İşlenen konum sayısı | 11.986 konum |
| `staleIgnored` | "Eski" diye yok sayılan konumlar | 0 |
| `duplicateIgnored` | "Tekrar" diye yok sayılan konumlar | 0 |
| `entriesReported` | API'nin "kullanıcı alana girdi" dediği toplam sayı | 6.000 |
| `entryStepsProcessed` | Senaryodaki 2. adımın (hücreye giriş) kaç kez işlendiği. Her biri 2 kayıt üretmelidir. | 3.000 adım × 2 = 6.000 kayıt |

**Doğruluk kontrolü.** Şu üç sayı aynı olmalıdır:

1. Veritabanındaki giriş kaydı sayısı (Yöntem 1'de Adım 3'teki sayı)
2. `entriesReported`
3. `entryStepsProcessed × 2`

Üçü aynıysa, sistem yoğun trafikte hiçbir girişi kaçırmamış ve hiçbir girişi iki kez yazmamış demektir.

**Yöntem 2'de** bu kontrol otomatik yapılır. Özetten sonra şu satırlar gelir (`←` ile başlayan açıklamalar burada eklendi):

```
--- entry log consistency ---
logs in DB:                      6000    ← veritabanındaki giriş kaydı
entries reported by API:         6000    ← API'nin bildirdiği giriş sayısı
expected (2 x entry steps):      6000    ← senaryoya göre beklenen sayı
duplicate (user, area, time):    0       ← iki kez yazılmış kayıt (0 olmalı)
```

[↑ İçindekiler](#icindekiler)

### 2.7 Sonuçlar

Sonuçlar iki soruya cevap verir:

1. Yoğun trafikte giriş kayıtları doğru oluşuyor mu?
2. İstekler ne kadar sürede cevaplanıyor?

Her testten önce test verisi temizlendi. Bazı testler birden fazla kez çalıştırıldı. Bu testlerde en düşük ve en yüksek değer aralık olarak yazıldı (örneğin `0,8–0,9 ms`). Testler arasında en az 45 saniye beklendi ([2.5](#25-testi-çalıştırma)).

#### Doğruluk: giriş kayıtları doğru mu?

| Test                          | Beklenen kayıt  | Oluşan kayıt    | Sonuç |
|-------------------------------|-----------------|-----------------|-------|
| Hedef: 2.000 istek/sn (4 kez) | 60.000          | 60.000          | Doğru |
| 100 kullanıcı                 | 400             | 400             | Doğru |
| 1.000 kullanıcı               | 6.000           | 6.000           | Doğru |
| 5.000 kullanıcı               | 30.000          | 30.000          | Doğru |
| 10.000 kullanıcı (3 kez)      | 60.000          | 60.000          | Doğru |

**Nasıl okunur:** Üçüncü satır: 1.000 kullanıcı 1 dakika boyunca konum gönderdi. Senaryoya göre 6.000 giriş kaydı oluşmalıydı ([2.3'teki hesap](#23-test-senaryosu)). Veritabanında tam 6.000 kayıt oluştu.

**Sonuç:** Her testte veritabanındaki giriş kaydı sayısı beklenen sayıyla aynı. Yoğun trafikte hiçbir giriş kaybolmadı ve hiçbir giriş iki kez yazılmadı.

#### Hız: istekler ne kadar sürede cevaplandı?

| Test                          | İstek/sn    | Tipik (p50) | Yavaş (p95) | Hata         | Durum |
|-------------------------------|-------------|-------------|-------------|--------------|-------|
| Hedef: 2.000 istek/sn (4 kez) | 1.994–1.996 | 0,8–0,9 ms  | 3,5–338 ms  | %0           | İyi   |
| 100 kullanıcı                 | 17          | 5,4 ms      | 14 ms       | %0           | İyi   |
| 1.000 kullanıcı               | 184         | 4,4 ms      | 19 ms       | %0           | İyi   |
| 5.000 kullanıcı               | 911         | 3,4 ms      | 107 ms      | %0           | İyi   |
| 10.000 kullanıcı (3 kez)      | 1.605–1.767 | 15–434 ms   | 1,4–1,7 s   | %0           | Yavaş |

Sütunlar:

- **İstek/sn:** API'nin bir saniyede cevapladığı konum isteği sayısı.
- **Tipik (p50):** İsteklerin yarısı bu süreden kısa sürede cevaplandı. Sıradan bir isteğin süresidir.
- **Yavaş (p95):** 100 istekten 95'i bu süreden kısa sürede cevaplandı. Yani en yavaş 5 istek bu süreden uzun sürdü.
- **Hata:** Başarılı cevap (`200`) alamayan isteklerin oranı.

**Nasıl okunur:** Üçüncü satır: 1.000 kullanıcı saniyede 184 konum gönderdi. İsteklerin yarısı 4,4 ms'den kısa sürede cevaplandı. 100 istekten 95'i 19 ms'den kısa sürede cevaplandı. Hiçbir istek başarısız olmadı.

**Sonuç:**

- **Hedef:** Hedef saniyede 2.000 istekti ([2.1](#21-neden-yük-testi-yaptık)). Sistem bu hızda çalıştı. Tipik bir konum isteği 1 milisaniyeden kısa sürede cevaplandı.
- **Aynı testte farklı sonuçlar:** Hedef test 4 kez çalıştırıldı. Tipik süre (p50) her seferinde aynı çıktı. Yavaş isteklerin süresi (p95) ise 3,5 ms ile 338 ms arasında değişti.
- **10.000 kullanıcı:** Saniyedeki istek sayısı hedef teste yakın, ama istekler daha yavaş cevaplandı. Kullanıcılar kademeli başlatıldığında tipik istek 7–8 ms'ye indi. Ayrıntı: [3.3](#33-testin-sınırları).
- **Yapılan iyileştirme:** Ölçümlerle sistemi en çok yavaşlatan nokta bulundu ve giderildi ([3.1](#31-yavaşlığın-kaynağı-nasıl-bulundu)).

**Test ortamı:** Bütün testler tek bir dizüstü bilgisayarda yapıldı: Apple Silicon işlemcili MacBook, 8 çekirdek, 16 GB bellek. Uygulama, k6 ve PostgreSQL aynı bilgisayarda çalıştı ve işlemciyi paylaştı. Gerçek bir sunucuda bu bileşenler ayrı makinelerde çalışır. Bu yüzden hız sonuçları gerçek kapasitenin **alt sınırı** olarak okunmalıdır. Farklı bir bilgisayarda hız sonuçları farklı çıkar. Giriş kaydı sayıları ise her bilgisayarda birebir tutmalıdır.

**Windows ve Linux:** Bu sonuçların hepsi yukarıdaki Mac'te ölçüldü. Testler Windows'ta ve Linux'ta çalıştırılmadı ve bu işletim sistemlerinde sonuç alınmadı.

[↑ İçindekiler](#icindekiler)

---

## 3. Performans: yavaşlığın araştırılması ve testin sınırları

Bu bölüm üç şeyi anlatır: ilk ölçümlerdeki yavaşlığın kaynağının nasıl bulunduğunu, ne değiştirildiğini ve testin sınırlarını.

### 3.1 Yavaşlığın kaynağı nasıl bulundu

**Başlangıç durumu.** İlk ölçümde, saniyede 2.000 istek testinde p95 69–102 ms idi. Yani 100 istekten 5'i 69–102 ms'den uzun sürüyordu.

Redis veya Kafka gibi yeni bir bileşen eklemek bir çözüm olabilirdi. Ama önce yavaşlığın nereden geldiği ölçüldü. Yavaşlığın sebebi bilinmeden eklenen bir bileşen sorunu çözmeyebilir ve sisteme bakım yükü ekler.

Bir konum isteği uygulamada şu yolu izler: HTTP isteği gelir → uygulama havuzdan bir veritabanı bağlantısı alır → veritabanına sorgular gönderir → cevap döner. Bu yoldaki her parça sırayla kontrol edildi:

| # | Soru | Nasıl ölçüldü | Sonuç | Anlamı |
|---|---|---|---|---|
| 1 | İstekleri karşılayan HTTP kısmı mı yavaş? | Yük altında, veritabanına hiç sorgu göndermeyen bir adrese istek gönderildi. | 1–5 ms'de cevap geldi. | HTTP kısmı hızlı. Sorun başka yerde. |
| 2 | İstekler veritabanı bağlantısı mı bekliyor? | Yük altında `/health` adresine istek gönderildi. Bu adres veritabanına sadece `SELECT 1` gönderir, yani en basit sorguyu. | 0,3–1 saniye sürdü. | En basit sorgu bile uzun sürüyor. Demek ki istekler havuzda boş bağlantı için sırada bekliyor. |
| 3 | Bağlantılar meşgulken ne yapıyor? | PostgreSQL'in açık bağlantıları ve her bağlantının o an ne yaptığını gösteren listesine (`pg_stat_activity`) bakıldı. | 20 bağlantının 11–15'i "transaction açık, uygulamadan sonraki komutu bekliyor" durumundaydı. | Veritabanı yavaş değil. Bağlantılar boşta duruyor ve uygulamanın sonraki komutu göndermesini bekliyor. |
| 4 | Uygulama sonraki komutu neden geç gönderiyor? | Node.js'in event loop doluluğu ölçüldü. | Event loop %60–74 doluydu. | Uygulama çok meşgul. Bir isteğin veritabanından cevabı gelince, sonraki komutu göndermek için event loop'ta sırasını bekliyor. Bu sırada bağlantı ve kullanıcının satır kilidi meşgul kalıyor. |
| 5 | Bağlantı sayısını artırmak çözer mi? | Havuz 20'den 50 bağlantıya çıkarıldı. | Yanıt süreleri iyileşmedi. | Sorun bağlantı sayısı değil. Her bağlantının ne kadar süre meşgul kaldığı. |

**Sonuç:** Bir konum isteği veritabanına çok fazla ayrı sorgu gönderiyordu. Her sorgudan sonra uygulama cevabı bekliyor, sonra event loop'ta sırasını bekleyip sonraki sorguyu gönderiyordu. Sorgu sayısı arttıkça bağlantının ve kilidin meşgul kaldığı süre uzuyordu. Çözüm, sorgu sayısını azaltmaktı.

[↑ İçindekiler](#icindekiler)

### 3.2 Ne değişti, sonuç ne oldu

**Değişiklik:** Bir konum isteğinin veritabanına gönderdiği sorgu sayısı 7'den 4'e indirildi. İş kuralları değişmedi ve bütün testler geçti.

Şu anki 4 sorgu ([`locations.service.ts`](src/locations/locations.service.ts)):

| # | Sorgu | Kodda |
|---|---|---|
| 1 | `BEGIN`: transaction'ı başlatır | [`locations.service.ts:52`](src/locations/locations.service.ts#L52) |
| 2 | Kullanıcının satırını kilitler **ve** aynı sorguda konumun hangi alanların içinde olduğunu bulur | [`lockStateAndFindAreas`, satır 122](src/locations/locations.service.ts#L122) |
| 3 | Yeni giriş kayıtlarını yazar **ve** aynı sorguda kullanıcının son durumunu günceller | [`locations.service.ts:97`](src/locations/locations.service.ts#L97) |
| 4 | `COMMIT`: transaction'ı bitirir ve kilidi bırakır | [`locations.service.ts:52`](src/locations/locations.service.ts#L52) |

Önceden 2. ve 3. satırdaki işlerin her biri ayrı sorgulardı. Örneğin önce kullanıcının satırı kilitleniyor, cevap bekleniyor, sonra ayrı bir sorguyla alanlar aranıyordu. Şimdi ikisi tek sorguda yapılıyor. 2. sorgu şöyle:

```sql
SELECT s.latitude, s.longitude, s.current_area_ids, s.last_timestamp,
       ARRAY(SELECT a.id FROM areas a
             WHERE ST_Covers(a.polygon, ST_SetSRID(ST_MakePoint($lon, $lat), 4326))
       ) AS area_ids
FROM user_location_states s
WHERE s.user_id = $userId
FOR UPDATE OF s;   -- kullanıcının satırını kilitler
```

Sorguların tamamı ve açıklaması: [README, 6.2](README.md#62-bir-konum-geldiğinde-ne-oluyor).

**Sonuç** (`rate` testi, saniyede 2.000 istek):

| Ölçüm | Önce | Sonra | Anlamı |
|---|---|---|---|
| p50 (tipik istek) | 2,5 ms | 0,8 ms | Tipik istek 3 kat hızlandı |
| Event loop doluluğu | %60–74 | yaklaşık %40 | Uygulamanın yükü azaldı |
| PostgreSQL CPU | %85 | %52 | Veritabanının yükü azaldı |

[↑ İçindekiler](#icindekiler)

### 3.3 Testin sınırları

Bu testler tek bir bilgisayarda yapıldı ve bazı sonuçlar bu ortamdan etkilendi. Aşağıdaki tablo, testlerde ne gözlendiğini ve bunun için ne yapıldığını gösterir.

| Konu | Ne gözlendi | Ne yapıldı |
|---|---|---|
| **10.000 kullanıcı testi daha yavaş** | 10.000 kullanıcı saniyede 1.600–1.770 istek gönderdi ve p95 1,4–1,7 saniye çıktı. Hedef test ise saniyede 2.000 istekte milisaniyeler içinde cevap verdi. k6'nın ölçümüne göre gecikme, bağlantı kurarken değil, sunucunun cevabını beklerken oluşuyor. | İki olası sebep ölçülerek elendi (aşağıda). Uygulama, k6 ve PostgreSQL aynı bilgisayarın işlemcisini paylaştığı için, kalan fark bu ortamda ayrıştırılamadı. Kullanıcılar 5 saniye yerine 1 dakikada kademeli başlatıldığında tipik istek 7–8 ms'ye, p95 0,6–1,0 saniyeye indi (aşağıda). |
| **Art arda başlatılan testlerde başarısız istekler** | 10.000 kullanıcı testi, önceki test bittikten 1 saniye sonra başlatıldığında isteklerin %15–23'ü başarısız oldu. Uygulamanın kendi kayıtlarında (log) hata yoktu. Giriş kayıtları yine doğruydu. | Sebep bulundu ve doğrulandı: Test bilgisayarında k6 için boş bağlantı portu kalmıyor. Uygulamayla ilgili değil (aşağıda). |
| **Aynı testte farklı sonuçlar** | Hedef test 4 kez çalıştırıldı. p50 her seferinde 0,8–0,9 ms, p95 ise 3,5 ms ile 338 ms arasında çıktı. | Tipik istek her testte aynı hızda. Yavaş istekler seyrek ve bazı testlerde toplu halde geliyor. Bu da paylaşılan ortamla uyumlu. |

**Art arda başlatılan testlerde başarısız istekler: sebep ve çözüm**

*Hata mesajı:* k6, başarısız istekler için şu uyarıyı yazdı: `dial: can't assign requested address`. Bu, k6'nın yeni bağlantı açmak için bilgisayarda boş port bulamadığı anlamına gelir. Bu istekler uygulamaya hiç ulaşmadı. Uygulamanın kayıtlarında hata görünmemesinin sebebi budur.

*Sebep:* Bilgisayar her bağlantı için bir port kullanır. macOS'ta bunun için 16.384 port vardır (49152–65535). Bir bağlantı kapandıktan sonra portu 30 saniye boyunca tekrar kullanılamaz (TIME_WAIT). 10.000 kullanıcı testi bitince 10.000 port bu bekleme durumuna geçer. Yeni test hemen başlarsa sadece 16.384 − 10.000 ≈ 6.380 boş port kalır. Kullanıcıların yaklaşık 3.600'ü 30 saniye dolana kadar bağlanamaz.

*Kanıt 1: zamanlama.* 10.000 kullanıcı testi toplam 19 kez çalıştırıldı:

| Önceki testle arasındaki süre | Test sayısı | %15'ten fazla hata alan |
|---|---|---|
| 1 saniye (art arda) | 6 | 5 |
| 30 saniye veya daha fazla (ya da günün ilk testi) | 13 | 0 |

*Kanıt 2: açık bağlantı sayısı.* Test boyunca uygulamaya açık bağlantı sayısı 2-3 saniyede bir kaydedildi. Hatalı testlerde bağlantı sayısı yaklaşık 20 saniye boyunca 6.365'te kaldı. Bu, yukarıda hesaplanan boş port sayısıdır.

| Zaman (yaklaşık) | Art arda başlatılan test | 45 saniye beklenip başlatılan test |
|---|---|---|
| Başlangıç | 4.569 | 4.341 |
| 4. saniye | 6.365 | 10.001 (hepsi bağlandı) |
| 4.–20. saniye | 6.365 (artmadı) | 10.001 |
| 20. saniyeden sonra | 6.614 → 8.530 → 10.001 | 10.001 |

*Kanıt 3: doğrudan deneme.* Bir test biter bitmez k6 tarafında 10.000 port bekleme durumundaydı. 45 saniye sonra bu sayı 0'a indi. Ardından başlatılan test %0 hatayla bitti.

*Çözüm:*

1. **Testler arasında en az 45 saniye beklemek.** Bu kural [2.5'e](#25-testi-çalıştırma) eklendi. 2.7'deki sonuçlar bu kurala göre alındı.
2. **Kullanıcıları kademeli başlatmak.** Bu da denendi: Test dosyasının geçici bir kopyasında 10.000 kullanıcı 5 saniye yerine 1 dakikada başlatıldı, sonra 1 dakika boyunca 10.000'de tutuldu. Test 2 kez çalıştırıldı. İkisinde de hata %0, tipik istek (p50) 7–8 ms, p95 0,6–1,0 saniye çıktı. Giriş kayıtları doğruydu (89.146 / 89.146 ve 90.346 / 90.346). Repo'daki test dosyası değiştirilmedi.
3. **k6'yı ayrı bilgisayarda çalıştırmak** (aşağıdaki "Bir sonraki adım").

**Ölçülerek elenen iki sebep:**

Bir tahminin yanlış olduğunu ölçerek göstermek de işe yarar. Yanlış yerde değişiklik yapılmasını önler.

| Tahmin | Nasıl ölçüldü | Sonuç |
|---|---|---|
| **Bağlantılar her istekte kapanıp yeniden açılıyor (keep-alive).** Node.js boştaki bağlantıyı yaklaşık 5 saniyede kapatır, test kullanıcıları da 5 saniyede bir istek gönderir. | k6 her isteğin yeni bağlantı açıp açmadığını kaydetti. Ayrıca bağlantıyı açık tutma süresi 65 saniyeye çıkarılıp test tekrarlandı. | Yanlış. Her sanal kullanıcı test boyunca tek bağlantı kullandı. Süreyi uzatmak yanıt sürelerini değiştirmedi. 65 saniyelik ayar kodda kaldı ([`main.ts`](src/main.ts), `HTTP_KEEP_ALIVE_TIMEOUT_MS`). Amacı hız değil: Node.js sürümü değişse veya telefon isteğini biraz geç gönderse de bağlantının iki istek arasında kapanmamasını sağlar. |
| **PostgreSQL'in checkpoint'i yavaşlatıyor.** Checkpoint sırasında veritabanı değişiklikleri toplu olarak diske yazar ([Kavramlar](#kavramlar)). | Testler sırasında checkpoint olup olmadığı kaydedildi ve yanıt süreleri karşılaştırıldı. | Yanlış. Checkpoint olmayan bir testte p95 338 ms, checkpoint olan bir testte 6 ms çıktı. |

**Bir sonraki adım:** Uygulama, PostgreSQL ve k6'yı ayrı bilgisayarlarda çalıştırıp aynı testleri tekrarlamak. Böylece işlemciyi paylaşmanın sonuçları ne kadar etkilediği görülebilir.

[↑ İçindekiler](#icindekiler)
