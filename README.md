# Marti Location Tracking API

Kullanıcıların telefonundan gelen konumları takip eden ve kullanıcı **tanımlı bir bölgeye girdiğinde** bunu kaydeden bir backend servisi.

**Örnek:** Haritada "Kadıköy" diye bir bölge çizilmiş olsun. Ali'nin telefonu her 5 saniyede bir konumunu servise gönderir. Ali Kadıköy'ün dışındayken bir şey olmaz. Kadıköy'e adım attığı anda servis "Ali, Kadıköy'e saat 09:00:05'te girdi" diye bir kayıt (log) oluşturur. Ali Kadıköy'de dolaşmaya devam ettiği sürece yeni kayıt oluşmaz. Kadıköy'den çıkıp tekrar girerse yeni bir kayıt oluşur.

---

<a id="icindekiler"></a>

## İçindekiler

1. [Temel kavramlar](#1-temel-kavramlar)
2. [Kurulum ve çalıştırma](#2-kurulum-ve-çalıştırma)
   - [Gereksinimler](#21-gereksinimler)
   - [Adım adım çalıştırma](#22-adım-adım-çalıştırma)
   - [Ayarlar](#23-ayarlar)
   - [Port doluysa](#24-port-doluysa)
   - [Faydalı komutlar](#25-faydalı-komutlar)
3. [API'yi deneme](#3-apiyi-deneme)
4. [Endpoint'ler](#4-endpointler)
   - [POST /areas — alan tanımla](#41-post-areas--alan-tanımla)
   - [GET /areas — alanları listele](#42-get-areas--alanları-listele)
   - [POST /locations — konum gönder](#43-post-locations--konum-gönder)
   - [GET /logs — giriş kayıtlarını listele](#44-get-logs--giriş-kayıtlarını-listele)
   - [GET /health — sağlık kontrolü](#45-get-health--sağlık-kontrolü)
5. [Veritabanı tabloları](#5-veritabanı-tabloları)
6. [Sistem nasıl çalışıyor](#6-sistem-nasıl-çalışıyor)
   - [Modüller](#61-modüller)
   - [Bir konum geldiğinde ne oluyor](#62-bir-konum-geldiğinde-ne-oluyor)
   - [GET /logs sayfalaması neden cursor ile](#63-get-logs-sayfalaması-neden-cursor-ile)
7. [Testler](#7-testler) (ayrıntılar: [TESTING.md](TESTING.md))
8. [Teknik tercihler](#8-teknik-tercihler)
9. [Varsayımlar](#9-varsayımlar)
10. [Kapsam dışı ve geliştirme yolu](#10-kapsam-dışı-ve-geliştirme-yolu)
11. [Proje yapısı](#11-proje-yapısı)

---

## 1. Temel kavramlar

README boyunca geçen kavramlar. Bilinenleri atlayabilirsiniz.

| Kavram | Açıklama |
|---|---|
| **Konum (koordinat)** | Dünya üzerindeki bir nokta. İki sayıdan oluşur: **enlem (latitude)** kuzey-güney konumu, -90 ile 90 arası; **boylam (longitude)** doğu-batı konumu, -180 ile 180 arası. Örnek: Kadıköy ≈ enlem 40.99, boylam 29.03. GPS'in ve Google Maps'in kullandığı standart sistemdir (WGS84). |
| **Alan / bölge (area)** | Haritada köşe noktaları verilerek çizilmiş kapalı bir şekil. Teknik adı **polygon** (çokgen). |
| **Delik (hole)** | Bir alanın içinde, alana dahil **olmayan** boşluk. Örnek: bir parkı alan olarak tanımlarsınız ama ortasındaki göl parka dahil olmasın istersiniz; göl, polygon'un "deliği" olur. Kullanıcı gölün üzerindeyse parkın içinde sayılmaz. |
| **Giriş kaydı (entry log)** | Kullanıcının bir alana girdiği an için oluşturulan kayıt: hangi kullanıcı, hangi alan, ne zaman. |
| **GeoJSON** | Coğrafi şekilleri JSON olarak yazmanın standart formatı. Alanları bu formatta gönderiyor ve alıyoruz. **Dikkat:** GeoJSON'da sıra `[boylam, enlem]`'dir (yani `[longitude, latitude]`), günlük kullanımdaki "enlem, boylam" sırasının tersidir. |
| **Endpoint** | API'nin dışarıya açtığı her bir adres + metot. Örnek: `POST /areas` bir endpoint'tir, `GET /areas` başka bir endpoint'tir. |
| **PostgreSQL** | Kullandığımız veritabanı. |
| **PostGIS** | PostgreSQL'e coğrafi özellikler ekleyen eklenti. "Bu nokta hangi alanların içinde?" sorusunu hızlı ve doğru cevaplar. |
| **Node.js / npm** | Node.js, JavaScript/TypeScript kodunu sunucuda çalıştıran ortamdır. npm, Node.js ile birlikte gelen paket yöneticisidir: projenin kullandığı kütüphaneleri indirir ve `npm run ...` komutlarını çalıştırır. |
| **NestJS** | Kullandığımız backend framework'ü (Node.js + TypeScript). Uygulamayı modüllere böler; her modülde HTTP isteklerini karşılayan **controller** ve iş mantığını içeren **service** bulunur ([bölüm 6.1](#61-modüller)). |
| **TypeORM** | TypeScript için ORM (Object-Relational Mapping) kütüphanesi: veritabanı tablolarını TypeScript sınıflarıyla eşler, böylece kayıt okuma/yazma işlemleri SQL yazmadan yapılabilir. |
| **Entity** | Bir veritabanı tablosunu temsil eden TypeScript sınıfı. Her tablonun bir entity'si vardır ([`src/entities`](src/entities)). |
| **DTO** | Bir isteğin hangi alanları, hangi kurallarla içermesi gerektiğini tanımlayan sınıf (Data Transfer Object). Kurallara uymayan istekler `400` hatası alır. |
| **Migration** | Veritabanı tablolarını oluşturan / değiştiren, sırayla uygulanan ve versiyonlanan SQL adımları. Böylece veritabanı şeması her bilgisayarda ve her ortamda aynı adımlarla, aynı şekilde kurulur. |
| **Transaction** | Birden fazla veritabanı işleminin tek bir bütün olarak yapılması: ya hepsi başarılı olur ya da hiçbiri uygulanmaz. Yarım kalmış kayıt oluşmaz. |
| **Index** | Veritabanının bir tabloda bütün satırları tek tek okumadan aradığını bulmasını sağlayan yapı; kitabın sonundaki dizin gibi. |
| **Swagger** | Tarayıcıdan API'yi görüp deneyebileceğiniz arayüz. Her endpoint'in ne aldığını, ne döndürdüğünü ve hangi hataları verebileceğini gösterir. |
| **Docker / container / image** | Docker, bir programı (burada PostgreSQL'i) bilgisayarınıza kurmadan, bilgisayarın geri kalanından ayrı bir ortamda çalıştırır. Bu ortamda çalışan programa **container**, container'ın oluşturulduğu ve internetten indirilen hazır pakete **image** denir. **Docker Compose**, birden fazla container'ı tek bir ayar dosyasıyla (`docker-compose.yml`) başlatıp durdurmayı sağlar. |
| **Port** | Bir programın bilgisayarda dinlediği "kapı numarası". Uygulama 3000, veritabanı 5440 numaralı portu kullanır. Aynı portu iki program aynı anda kullanamaz. |
| **Canlı ortam (production)** | Uygulamanın gerçek kullanıcılara hizmet verdiği ortam; geliştiricinin kendi bilgisayarının tersi. |
| **k6** | Yük testi aracı: binlerce kullanıcı aynı anda istek gönderiyormuş gibi trafik üretip sistemin nasıl davrandığını ölçer ([TESTING.md, bölüm 2](TESTING.md#2-performans-testi-k6)). |

[↑ İçindekiler](#icindekiler)

---

## 2. Kurulum ve çalıştırma

Bu bölümdeki komutlar macOS'ta, temiz bir kopya üzerinde sırayla çalıştırılarak denendi. Komutun Windows'ta farklı yazıldığı yerlerde iki versiyon da verilmiştir (Windows versiyonları Windows'ta denenmedi). Windows'ta komutları **PowerShell**'de çalıştırın (Başlat menüsünde "PowerShell" diye aratın).

<a id="denenen-ortamlar"></a>

**Hangi ortamlarda denendi?**

| Ortam | Durum |
|---|---|
| macOS (Apple Silicon işlemcili MacBook, Docker Desktop) | Kurulum, API örnekleri, unit ve e2e testler ve performans testi bu ortamda denendi. README ve [TESTING.md](TESTING.md)'deki beklenen çıktılar bu ortamdan alındı. |
| Windows | **Denenmedi.** Komutların çoğu (`npm`, `docker`, `k6`) her işletim sisteminde aynı yazılır; farklı yazılan komutlar için Windows versiyonu ayrıca verildi. Yine de Windows'ta çalıştığı doğrulanmadı. |
| Linux | **Denenmedi.** Komutlar macOS ile aynı yazılır, ama Linux'ta çalıştığı doğrulanmadı. |

Windows'ta veya Linux'ta denemek isterseniz şu sırayı izleyin ve her adımın sonucunu README'de yazan beklenen sonuçla karşılaştırın:

1. [2.2](#22-adım-adım-çalıştırma)'deki adımları sırayla çalıştırın (Windows'ta PowerShell'de).
2. http://localhost:3000/health adresini açın; `"status":"ok"` görmelisiniz.
3. `npm test` ve `npm run test:e2e` komutlarını çalıştırın; [TESTING.md, bölüm 1](TESTING.md#1-unit-ve-e2e-testler)'deki test sayılarını görmelisiniz.
4. API'yi Swagger ile deneyin ([bölüm 3](#3-apiyi-deneme)); Swagger tarayıcıda çalıştığı için işletim sisteminden etkilenmez.
5. Performans testini isterseniz [TESTING.md'deki Yöntem 1](TESTING.md#yontem-1-docker) ile Docker üzerinden çalıştırın. Yöntem 2 sadece macOS'ta çalışır.

Bir adımın sonucu README'de yazandan farklıysa, bu büyük ihtimalle o işletim sistemine özgü bir farktır. Hangi adımda ne gördüğünüzü not edin.

### 2.1 Gereksinimler

| Araç | Ne için | Versiyon | Kontrol komutu | Kurulum |
|---|---|---|---|---|
| **Node.js** (npm ile birlikte gelir) | Uygulamayı ve testleri çalıştırmak | 24.15 veya üzeri 24.x (önerilen) ya da 22.22.3 veya üzeri 22.x | `node -v` | https://nodejs.org → "LTS" sürümünü indirip kurun |
| **Docker** (Docker Compose ile birlikte) | Veritabanını çalıştırmak, e2e testler | Compose v2 veya üzeri | `docker --version` ve `docker compose version` | Aşağıya bakın |
| **Git** | Projeyi indirmek | herhangi | `git --version` | https://git-scm.com |

Performans testi (k6) için ayrıca bir program kurmanız gerekmez; k6 Docker üzerinden çalışır ([TESTING.md, bölüm 2.5](TESTING.md#25-testi-çalıştırma)).

**Docker kurulumu:**

- **macOS / Windows:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) indirip kurun ve **uygulamayı açın**. Docker komutları, Docker Desktop açıkken çalışır (menü çubuğunda / görev çubuğunda balina simgesi görünür).
- **Linux:** [Docker Engine kurulumu](https://docs.docker.com/engine/install/) ve [Compose eklentisi](https://docs.docker.com/compose/install/linux/).

Veritabanı versiyonu: proje **PostgreSQL 17 + PostGIS 3.5** ile geliştirildi ve test edildi. Docker bu versiyonu otomatik indirir; bilgisayarınıza ayrıca PostgreSQL kurmanız gerekmez. Bilgisayarınızda zaten bir PostgreSQL çalışıyorsa sorun olmaz: bu projenin veritabanı farklı bir port (5440) kullanır.

[↑ İçindekiler](#icindekiler)

### 2.2 Adım adım çalıştırma

**1. Projeyi indirin ve bağımlılıkları kurun**

```bash
git clone https://github.com/ErennSaglam/location-tracking-service-Marti.git
cd location-tracking-service-Marti
npm ci
```

`npm ci`, projenin kullandığı kütüphaneleri `package-lock.json`'daki versiyonlarıyla birebir indirir (1–2 dakika sürebilir). Çıktıda `npm warn` ile başlayan satırlar görebilirsiniz; bunlar uyarıdır, kurulumu durdurmaz. Komut `npm error` ile bitmediyse kurulum başarılıdır.

**2. Ayar dosyasını oluşturun**

```bash
cp .env.example .env
```

Bu komut PowerShell'de de aynen çalışır. Windows'ta eski Komut İstemi'ni (cmd) kullanıyorsanız: `copy .env.example .env`.

`.env`, uygulamanın ve veritabanının ayarlarını (port, kullanıcı adı, şifre) içerir. Varsayılan değerlerle doğrudan çalışır; değiştirmeniz gerekmez (ayarların listesi: [2.3](#23-ayarlar)).

**3. Veritabanını başlatın**

```bash
docker compose up -d
```

PostgreSQL + PostGIS, `location-tracking-postgres` adında bir container olarak `localhost:5440` portunda başlar. İlk seferde image indirildiği için 1–2 dakika sürebilir. Çalıştığını kontrol edin:

```bash
docker ps --filter name=location-tracking-postgres
```

`STATUS` sütununda `Up ... (healthy)` görmelisiniz. `(health: starting)` görüyorsanız birkaç saniye bekleyip tekrar çalıştırın.

> **Hata:** `port is already allocated` → 5440 portunu başka bir program kullanıyor. Çözüm: [2.4 Port doluysa](#24-port-doluysa).
>
> **Hata:** `The container name "/location-tracking-postgres" is already in use` → Bu projenin daha önceki bir kopyasından kalan bir container var. Eski container'ı silin ve komutu tekrar çalıştırın (eski container'daki veriler bu projede kullanılmaz):
> `docker rm -f location-tracking-postgres`

**4. Tabloları oluşturun (migration)**

```bash
npm run migration:run
```

Bu komut kodu derler ve [`src/database/migrations`](src/database/migrations) klasöründeki migration'ları veritabanına uygular. Çıktının son satırları arasında şunu görmelisiniz:

```
Migration InitialSchema1792916810000 has been executed successfully.
```

**5. Tabloların gerçekten oluştuğunu kontrol edin**

```bash
docker exec location-tracking-postgres psql -U location -d location_tracking -c "\dt public.*"
```

Bu komut, container'ın içindeki PostgreSQL'e bağlanıp tabloları listeler. Beklenen çıktı:

```
 Schema |         Name         | Type  |  Owner
--------+----------------------+-------+----------
 public | area_entry_logs      | table | location
 public | areas                | table | location
 public | spatial_ref_sys      | table | location
 public | typeorm_migrations   | table | location
 public | user_location_states | table | location
```

Bizim tablolarımız: `areas`, `user_location_states`, `area_entry_logs` (ne işe yaradıkları: [bölüm 5](#5-veritabanı-tabloları)). `spatial_ref_sys` PostGIS'in kendi tablosudur; `typeorm_migrations` hangi migration'ların uygulandığını tutar. Migration durumunu şu komutla da görebilirsiniz:

```bash
npm run migration:show
```

Çıktıda `[X]` ile başlayan satır uygulanmış, `[ ]` ile başlayan satır henüz uygulanmamış migration'dır.

**6. Uygulamayı başlatın**

```bash
npm run start:dev
```

`Nest application successfully started` mesajını görünce uygulama hazırdır. Bu terminal penceresi açık kaldığı sürece uygulama çalışır.

Uygulama varsayılan olarak 3000 portunda çalışır (bu port bilgisayarınızda başka bir program tarafından kullanılıyorsa `.env` dosyasında örneğin `PORT=3001` yapabilirsiniz; bkz. [2.4](#24-port-doluysa)). Bu README'deki adreslerde 3000 yazan yerlere kendi portunuzu yazın.

| Adres | Ne var |
|---|---|
| http://localhost:3000/ | Ana adres: servisin adı ve Swagger / sağlık kontrolü adresleri. Uygulamanın çalıştığını görmenin en kolay yolu. |
| http://localhost:3000/docs | Swagger: API'yi tarayıcıdan deneyin ([bölüm 3](#3-apiyi-deneme)) |
| http://localhost:3000/health | Servis ve veritabanı çalışıyor mu? `"status":"ok"` görmelisiniz. |

> **Hata:** `EADDRINUSE: address already in use :::3000` → 3000 portunu başka bir program kullanıyor. Çözüm: [2.4 Port doluysa](#24-port-doluysa).

**Kapatmak için:** uygulamayı çalıştığı terminalde `Ctrl + C` ile durdurun; veritabanını `docker compose down` ile kapatın. Veriler silinmez, bir sonraki `docker compose up -d` ile kaldığı yerden devam eder. Verileri de tamamen silmek için: `docker compose down -v`.

[↑ İçindekiler](#icindekiler)

### 2.3 Ayarlar

Ayarlar `.env` dosyasından okunur. Hepsinin varsayılan değeri vardır. Değiştirdikten sonra uygulamayı yeniden başlatın.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3000` | Uygulamanın çalıştığı port. |
| `DB_HOST` | `localhost` | Veritabanının adresi |
| `DB_PORT` | `5440` | Veritabanının portu. Bilgisayarınızda zaten çalışan bir PostgreSQL varsa onunla çakışmasın diye standart 5432 yerine 5440 seçildi. Docker Compose da bu değeri aynı `.env` dosyasından okur; değiştirdiğinizde hem container hem uygulama yeni portu kullanır. |
| `DB_USER` / `DB_PASSWORD` | `location` / `location` | Veritabanı kullanıcısı / şifresi (sadece lokal geliştirme için) |
| `DB_NAME` | `location_tracking` | Veritabanının adı |
| `DB_POOL_SIZE` | `20` | Uygulamanın veritabanına aynı anda açık tuttuğu en fazla bağlantı sayısı |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | `65000` | Bir istek bittikten sonra HTTP bağlantısının kaç milisaniye açık bekletileceği. Telefonlar 5 saniyede bir konum gönderir. Node.js'in varsayılan süresi de yaklaşık 5 saniyedir. Bağlantının iki istek arasında kapanmaması için süre 65 saniye seçildi. Ölçüm: [TESTING.md, 3.3](TESTING.md#33-testin-sınırları) |

[↑ İçindekiler](#icindekiler)

### 2.4 Port doluysa

Proje iki port kullanır: uygulama **3000**, veritabanı **5440**. Bir portun kullanılıp kullanılmadığını görmek için (örnekteki `3000` yerine kontrol etmek istediğiniz portu yazın; Windows komutu Windows'ta denenmedi):

| macOS / Linux | Windows (PowerShell) |
|---|---|
| `lsof -i :3000` | `netstat -ano \| findstr :3000` |

Çıktı boşsa port boştur. Bir satır görüyorsanız port başka bir program tarafından kullanılıyordur. İki seçenek var: o programı kapatın veya bu projenin portunu değiştirin.

Her iki port da **sadece `.env` dosyasından** okunur; kodda veya ayar dosyalarında elle değiştirmeniz gereken başka bir yer yoktur. Değiştirdiğinizde aşağıdaki tablolarda listelenen yerlerde yeni portu kullanmanız yeterlidir.

#### Uygulama portunu değiştirmek (örnek: 3000 yerine 3001)

1. `.env` dosyasında `PORT=3000` satırını `PORT=3001` yapın.
2. Uygulamayı yeniden başlatın (`Ctrl + C`, sonra `npm run start:dev`).
3. http://localhost:3001/health adresini açın. Açılmıyorsa `.env` dosyasını kaydettiğinizden emin olun.

Bundan sonra yeni portu kullanmanız gereken yerler:

| Nerede | 3000 ile (varsayılan) | 3001 ile |
|---|---|---|
| Swagger | http://localhost:3000/docs | http://localhost:3001/docs |
| Sağlık kontrolü | http://localhost:3000/health | http://localhost:3001/health |
| README'deki curl örnekleri ([bölüm 4](#4-endpointler)) | `http://localhost:3000/...` | Adresteki `3000`'i `3001` yapın |
| Performans testi, Yöntem 1 — Docker ([TESTING.md, bölüm 2.5](TESTING.md#25-testi-çalıştırma)) | `-e BASE_URL=http://host.docker.internal:3000` | Komuttaki `3000`'i `3001` yapın |
| Performans testi, Yöntem 2 — script ([TESTING.md, bölüm 2.5](TESTING.md#25-testi-çalıştırma)) | `load/run-scenario.sh users 1000 1m` | Komutun başına ekleyin: `PORT=3001 load/run-scenario.sh users 1000 1m` |

Etkilenmeyenler: unit ve e2e testler (port kullanmazlar, uygulamayı kendi içlerinde başlatırlar) ve veritabanı.

#### Veritabanı portunu değiştirmek (örnek: 5440 yerine 5441)

1. `.env` dosyasında `DB_PORT=5440` satırını `DB_PORT=5441` yapın.
2. Veritabanını yeniden başlatın: `docker compose down`, sonra `docker compose up -d`. Docker Compose portu aynı `.env` dosyasından okur; `docker ps` çıktısında `0.0.0.0:5441->5432/tcp` görmelisiniz.
3. Uygulamayı yeniden başlatın.

Bu port otomatik olarak şunlara yansır: veritabanı container'ı (`docker-compose.yml`), uygulamanın veritabanı bağlantısı ve migration komutları (`npm run migration:run` vb.). Elle değiştirmeniz gereken bir yer yoktur.

Etkilenmeyenler: README'deki `docker exec ...` komutları (container'ın içinden bağlandıkları için portu kullanmazlar), e2e testler (kendi geçici veritabanlarını rastgele boş bir portta açarlar) ve uygulama portu.

> `5432` portu PostgreSQL'in standart portudur. Container'ın **içinde** PostgreSQL her zaman 5432'de çalışır; `.env`'deki `DB_PORT`, bilgisayarınızdan container'a ulaşılan dış porttur. Bu yüzden `docker ps` çıktısında `5441->5432` görürsünüz.

[↑ İçindekiler](#icindekiler)

### 2.5 Faydalı komutlar

| Komut | Ne yapar |
|---|---|
| `npm run start:dev` | Uygulamayı geliştirme modunda başlatır (kod değişince kendini yeniden başlatır) |
| `npm run build` ve ardından `npm run start:prod` | Kodu derleyip canlı ortamdaki gibi başlatır |
| `npm run migration:run` | Uygulanmamış migration'ları çalıştırır |
| `npm run migration:revert` | Son migration'ı geri alır |
| `npm run migration:show` | Hangi migration'ların uygulandığını gösterir |
| `npm test` | Unit testler ([bölüm 7](#7-testler)) |
| `npm run test:e2e` | Uçtan uca testler ([bölüm 7](#7-testler)) |

> Migration'lar uygulama açılırken **otomatik çalışmaz**; `npm run migration:run` ile ayrıca çalıştırılır. Böylece tablolarda yapılacak değişikliklerin zamanına siz karar verirsiniz; tablolar uygulama her açıldığında kendiliğinden değişmez.

[↑ İçindekiler](#icindekiler)

---

## 3. API'yi deneme

### Swagger ile (önerilen, her işletim sisteminde aynı)

Swagger, uygulama çalışırken tarayıcıdan açılan bir sayfadır; kod yazmadan veya ek program kurmadan API'ye istek göndermenizi sağlar.

1. http://localhost:3000/docs adresini açın.
2. Bir endpoint'e tıklayın, örn. `POST /areas`. Açılan bölümde endpoint'in ne yaptığı, örnek istek ve olası tüm yanıtlar (başarılı ve hatalı) görünür.
3. **Try it out** düğmesine basın; istek kutusu örnek bir değerle dolu gelir.
4. **Execute**'a basın; sunucunun gerçek yanıtı altta görünür.

Önerilen deneme sırası:

1. `POST /areas` → örnek "Kadikoy" alanını oluşturun. Yanıtta alanın `id` değerini görürsünüz (boş bir veritabanında `1`).
2. `POST /locations` → bu alanın içinde bir konum gönderin (örnek değer hazır gelir). Yanıtta `"enteredAreaIds": [1]` görmelisiniz: kullanıcı alana girdi, kayıt oluştu.
3. Aynı isteği `timestamp` değerini 5 saniye ileri alarak (örn. `09:00:05` → `09:00:10`) tekrar gönderin → `"enteredAreaIds": []`: kullanıcı hâlâ içeride, yeni kayıt yok.
4. `GET /logs` → oluşan giriş kaydını görün.

### curl ile

curl, komut satırından HTTP isteği gönderen bir araçtır. Her endpoint'in curl örneği bir sonraki bölümde. Örnekler macOS / Linux terminali içindir. Windows'ta Swagger'ı kullanmanız önerilir. curl kullanmak isterseniz örnekleri **Git Bash**'te (Git ile birlikte kurulan, macOS terminaline benzeyen bir komut satırı) çalıştırın; PowerShell'de satır sonundaki `\` işareti (komutu bir sonraki satırda devam ettirir) farklı çalışır; bazı PowerShell sürümlerinde `curl` komutu da başka bir komutun kısayoludur. Bu yüzden örnekler PowerShell'de olduğu gibi çalışmaz. Örnekler Git Bash'te denenmedi.

Bir sonraki bölümdeki örnekler, sırayla ve **boş bir veritabanında** çalıştırıldığında yazılan yanıtları verir. Swagger'da aynı örnekleri zaten gönderdiyseniz yanıtlar farklı olur (örneğin aynı isimli alan için `409`). Veritabanını boşaltmak için (tablolar kalır, içlerindeki kayıtlar silinir):

```bash
docker exec location-tracking-postgres psql -U location -d location_tracking -c "TRUNCATE areas, user_location_states, area_entry_logs RESTART IDENTITY CASCADE;"
```

Çıktıda `TRUNCATE TABLE` görmelisiniz.

[↑ İçindekiler](#icindekiler)

---

## 4. Endpoint'ler

Özet:

| Metot ve adres | Ne yapar |
|---|---|
| `POST /areas` | Yeni bir alan (polygon) tanımlar |
| `GET /areas` | Tanımlı tüm alanları listeler |
| `POST /locations` | Kullanıcının güncel konumunu gönderir; kullanıcı yeni bir alana girdiyse giriş kaydı oluşturur |
| `GET /logs` | Giriş kayıtlarını listeler (filtreleme ve sayfalama ile) |
| `GET /health` | Servisin ve veritabanının çalıştığını kontrol eder |
| `GET /` | Ana adres: servisin adını ve faydalı adresleri (Swagger, sağlık kontrolü) döndürür |

Hata yanıtları her endpoint'te aynı yapıdadır:

```json
{ "message": "hatanın açıklaması (veya açıklama listesi)", "error": "Bad Request", "statusCode": 400 }
```

Her endpoint için geçerli iki kural:

- Veritabanının saklayamayacağı bir değer içeren istekler (çok büyük sayılar, metin içinde görünmez NUL karakteri, desteklenmeyen tarihler) veritabanına gönderilmeden `400` hatası alır.
- Veritabanına ulaşılamıyorsa `503 Service Unavailable` döner. Bu, hatanın istemciden değil sunucudan kaynaklandığını ve isteğin daha sonra tekrar denenebileceğini gösterir.

### 4.1 `POST /areas` — alan tanımla

Haritaya yeni bir bölge ekler. Bölge, köşe noktalarının listesiyle tanımlanır.

```bash
curl -X POST http://localhost:3000/areas \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Kadikoy",
    "polygon": {
      "type": "Polygon",
      "coordinates": [[[29.0,41.0],[29.1,41.0],[29.1,41.1],[29.0,41.1],[29.0,41.0]]]
    }
  }'
```

Aynı isteği Swagger'dan da gönderebilirsiniz: http://localhost:3000/docs adresinde `POST /areas` → **Try it out** → **Execute** (istek kutusu bu JSON ile dolu gelir; ayrıntılar: [bölüm 3](#3-apiyi-deneme)).

**İstek alanları:**

| Alan | Açıklama |
|---|---|
| `name` | Alanın adı. Benzersiz olmalı, en fazla 100 karakter. |
| `polygon.type` | Her zaman `"Polygon"`. |
| `polygon.coordinates` | Köşe noktaları. Her nokta `[boylam, enlem]`. Kurallar: en az 4 nokta; **ilk ve son nokta aynı olmalı** (şekil kapanmalı); kenarlar birbirini kesmemeli. Yukarıdaki örnek 4 köşeli bir dikdörtgendir (5. nokta, şekli kapatmak için 1. noktanın tekrarıdır). Örnekteki dikdörtgen anlatımı kolaylaştırmak için seçildi; Kadıköy'ün gerçek sınırları değildir. |

İsteğe bağlı delik (hole): `coordinates` içine ikinci bir köşe listesi eklenir. İlk liste alanın dış sınırı, sonrakiler deliklerdir:

```json
"coordinates": [
  [[29.0,41.0],[29.1,41.0],[29.1,41.1],[29.0,41.1],[29.0,41.0]],
  [[29.04,41.04],[29.06,41.04],[29.06,41.06],[29.04,41.06],[29.04,41.04]]
]
```

**Başarılı yanıt — `201 Created`:**

```json
{
  "id": 1,
  "name": "Kadikoy",
  "polygon": { "type": "Polygon", "coordinates": [[[29,41],[29.1,41],[29.1,41.1],[29,41.1],[29,41]]] },
  "createdAt": "2026-10-27T10:23:25.844Z"
}
```

**Olası hatalar:**

| Kod | Ne zaman | Örnek mesaj |
|---|---|---|
| `400` | Şekil kapanmamış, 4'ten az nokta, geçersiz koordinat, `Polygon` dışında tip | `polygon.coordinates: ring 0 must be closed (first and last positions equal)` |
| `400` | Kenarlar birbirini kesiyor (örn. "papyon" şekli) | `Invalid polygon: Self-intersection[29.05 41.05]` |
| `409` | Aynı isimde alan zaten var | `Area name "Kadikoy" already exists` |

Alanlar iç içe veya birbirleriyle örtüşük olabilir (örn. "İstanbul" ve onun içinde "Kadıköy").

[↑ İçindekiler](#icindekiler)

### 4.2 `GET /areas` — alanları listele

```bash
curl http://localhost:3000/areas
```

**Yanıt — `200 OK`:** `POST /areas` yanıtındaki yapıda alanların listesi, `id` sırasıyla.

```json
[
  { "id": 1, "name": "Kadikoy", "polygon": { "type": "Polygon", "coordinates": [[[29,41],[29.1,41],[29.1,41.1],[29,41.1],[29,41]]] }, "createdAt": "2026-10-27T10:23:25.844Z" }
]
```

[↑ İçindekiler](#icindekiler)

### 4.3 `POST /locations` — konum gönder

Mobil uygulamanın ~5 saniyede bir çağırdığı endpoint. Servis, konumun hangi alanların içinde olduğuna bakar ve kullanıcı **yeni** bir alana girdiyse giriş kaydı oluşturur.

```bash
curl -X POST http://localhost:3000/locations \
  -H 'Content-Type: application/json' \
  -d '{ "userId": "ali", "latitude": 41.05, "longitude": 29.05, "timestamp": "2026-10-27T09:00:05.000Z" }'
```

**İstek alanları:**

| Alan | Açıklama |
|---|---|
| `userId` | Kullanıcının kimliği (metin, en fazla 128 karakter). |
| `latitude` | Enlem, -90 ile 90 arası. |
| `longitude` | Boylam, -180 ile 180 arası. |
| `timestamp` | Konumun telefonda alındığı an. ISO 8601 formatında ve **saat dilimiyle**: `2026-10-27T09:00:05.000Z` (`Z` = UTC) veya `2026-10-27T12:00:05.000+03:00`. Şu andan en fazla 60 saniye ileride olabilir. |

**Başarılı yanıt — `200 OK`:**

```json
{ "status": "processed", "enteredAreaIds": [1], "currentAreaIds": [1] }
```

| Alan | Anlamı |
|---|---|
| `status` | Konumun işlenip işlenmediği; işlenmediyse nedeni (aşağıdaki tablo). |
| `enteredAreaIds` | Bu konumla kullanıcının **yeni girdiği** alanların id'leri. Bu alanların her biri için giriş kaydı oluşturuldu. Boşsa yeni giriş yok. |
| `currentAreaIds` | Kullanıcının şu an içinde bulunduğu tüm alanlar. |

| `status` | Anlamı |
|---|---|
| `processed` | Konum işlendi. |
| `stale_ignored` | Bu konum, kullanıcının daha önce işlenmiş bir konumundan **daha eski**. Mobil ağda istekler bazen geç ya da karışık sırada gelir; eski bir konumun kullanıcıyı "geriye taşımaması" için yok sayılır. |
| `duplicate_ignored` | Aynı konum aynı zamanla **tekrar** gönderildi (telefon isteği yeniden denedi). Yok sayılır, ikinci kayıt oluşmaz. |

**Örnek senaryo:** Veli adlı bir kullanıcı sırayla 7 konum gönderiyor. Kadıköy alanı ([4.1](#41-post-areas--alan-tanımla)'deki örnek, id = 1) tanımlı olmalı. "Kadıköy içi" enlem 41.05 / boylam 29.05, "Kadıköy dışı" enlem 41.2 / boylam 29.2 noktasıdır.

| # | Veli'nin gönderdiği | Yanıt | Açıklama |
|---|---|---|---|
| 1 | 09:00:00, Kadıköy dışı | `processed`, `enteredAreaIds: []` | Hiçbir alanda değil |
| 2 | 09:00:05, Kadıköy içi | `processed`, `enteredAreaIds: [1]` | **Giriş → kayıt oluştu** |
| 3 | 09:00:10, Kadıköy içi | `processed`, `enteredAreaIds: []` | Hâlâ içeride → kayıt yok |
| 4 | 09:00:10, aynı konum tekrar | `duplicate_ignored` | Tekrar gönderim |
| 5 | 09:00:03, Kadıköy dışı (geç gelen eski istek) | `stale_ignored` | Eski konum, yok sayıldı; Veli hâlâ içeride sayılır |
| 6 | 09:00:15, Kadıköy dışı | `processed`, `enteredAreaIds: []` | Çıktı |
| 7 | 09:00:20, Kadıköy içi | `processed`, `enteredAreaIds: [1]` | **Tekrar giriş → yeni kayıt** |

Senaryoyu kendiniz denemek için komutları sırayla çalıştırın (her komut tablodaki bir satırdır):

```bash
curl -X POST http://localhost:3000/locations -H 'Content-Type: application/json' -d '{ "userId": "veli", "latitude": 41.2, "longitude": 29.2, "timestamp": "2026-10-27T09:00:00.000Z" }'
curl -X POST http://localhost:3000/locations -H 'Content-Type: application/json' -d '{ "userId": "veli", "latitude": 41.05, "longitude": 29.05, "timestamp": "2026-10-27T09:00:05.000Z" }'
curl -X POST http://localhost:3000/locations -H 'Content-Type: application/json' -d '{ "userId": "veli", "latitude": 41.05, "longitude": 29.05, "timestamp": "2026-10-27T09:00:10.000Z" }'
curl -X POST http://localhost:3000/locations -H 'Content-Type: application/json' -d '{ "userId": "veli", "latitude": 41.05, "longitude": 29.05, "timestamp": "2026-10-27T09:00:10.000Z" }'
curl -X POST http://localhost:3000/locations -H 'Content-Type: application/json' -d '{ "userId": "veli", "latitude": 41.2, "longitude": 29.2, "timestamp": "2026-10-27T09:00:03.000Z" }'
curl -X POST http://localhost:3000/locations -H 'Content-Type: application/json' -d '{ "userId": "veli", "latitude": 41.2, "longitude": 29.2, "timestamp": "2026-10-27T09:00:15.000Z" }'
curl -X POST http://localhost:3000/locations -H 'Content-Type: application/json' -d '{ "userId": "veli", "latitude": 41.05, "longitude": 29.05, "timestamp": "2026-10-27T09:00:20.000Z" }'
```

`409` hatasını görmek için 7. adımla aynı zamanda farklı bir konum gönderin:

```bash
curl -X POST http://localhost:3000/locations -H 'Content-Type: application/json' -d '{ "userId": "veli", "latitude": 41.06, "longitude": 29.05, "timestamp": "2026-10-27T09:00:20.000Z" }'
```

**Olası hatalar:**

| Kod | Ne zaman | Örnek mesaj |
|---|---|---|
| `400` | Eksik/hatalı alan, aralık dışı koordinat, saat dilimi olmayan zaman | `["latitude must not be greater than 90", "timestamp must include a timezone offset (Z or ±hh:mm)"]` |
| `400` | Zaman 60 saniyeden daha fazla ileride (gelecekte) | `timestamp is in the future` |
| `409` | Aynı kullanıcı için **aynı zamanda farklı bir konum** daha önce kaydedilmiş | `A different location was already recorded for this user at this timestamp` |

[↑ İçindekiler](#icindekiler)

### 4.4 `GET /logs` — giriş kayıtlarını listele

```bash
curl 'http://localhost:3000/logs'
curl 'http://localhost:3000/logs?userId=ali'
curl 'http://localhost:3000/logs?areaId=1&limit=20'
```

Sırasıyla: tüm kayıtlar (en yeniden eskiye); sadece Ali'nin girişleri; 1 numaralı alana girişler, sayfa başı 20 kayıt.

**Parametreler (hepsi isteğe bağlı):**

| Parametre | Açıklama |
|---|---|
| `userId` | Sadece bu kullanıcının kayıtları |
| `areaId` | Sadece bu alanın kayıtları |
| `limit` | Bir sayfada kaç kayıt (1–100, varsayılan 50) |
| `cursor` | Sonraki sayfayı almak için, bir önceki yanıttaki `nextCursor` değeri |

**Yanıt — `200 OK`.** Örnek: önceki adımları sırayla yaptıysanız `curl 'http://localhost:3000/logs?limit=1'` şu yanıtı verir (en yeni kayıt, Veli'nin tekrar girişi):

```json
{
  "data": [
    { "id": "3", "userId": "veli", "areaId": 1, "entryTime": "2026-10-27T09:00:20.000Z" }
  ],
  "nextCursor": "MjAyNi0xMC0yN1QwOTowMDoyMC4wMDBafDM"
}
```

| Alan | Anlamı |
|---|---|
| `data` | Giriş kayıtları, en yeniden eskiye. |
| `data[].id` | Kaydın numarası (çok büyük sayılara ulaşabileceği için metin olarak döner). |
| `data[].userId` | Giren kullanıcı. |
| `data[].areaId` | Girilen alan (`GET /areas`'taki `id`). |
| `data[].entryTime` | Giriş anı: alana girilen konumun `timestamp` değeri. |
| `nextCursor` | Sonraki sayfayı istemek için kullanılacak anahtar. `null` ise başka kayıt yok. |

**Sayfalama nasıl çalışır:** İlk istekte `cursor` göndermezsiniz. Yanıttaki `nextCursor` değerini bir sonraki isteğe ekleyerek devam edersiniz:

```bash
curl 'http://localhost:3000/logs?limit=1&cursor=MjAyNi0xMC0yN1QwOTowMDoyMC4wMDBafDM'
```

`cursor=` sonrasına kendi yanıtınızdaki `nextCursor` değerini yazın. Değerin içeriğini yorumlamanız gerekmez; olduğu gibi geri gönderin. Son sayfada `nextCursor` değeri `null` olur.

Adresi tırnak (`'...'`) içinde yazın. `?` ve `&` karakterleri tırnaksız yazılırsa terminal bunları kendi özel karakteri olarak yorumlar ve istek hatalı gider.

**Olası hatalar:** `400` — `limit` 1–100 dışında (`limit must not be greater than 100`), `areaId` sayı değil, `cursor` bozuk (`Invalid cursor`).

[↑ İçindekiler](#icindekiler)

### 4.5 `GET /health` — sağlık kontrolü

Servisin çalışıp çalışmadığını ve veritabanına bağlanıp bağlanamadığını gösterir.

Uygulamayı çalıştıran kişi terminalde başlangıç mesajını görür; dışarıdan bakan biri (başka bir geliştirici, test eden kişi) bu terminali göremez. API'nin çalışıp çalışmadığını bu adrese istek göndererek anlar.

**Nasıl çalışır:** İstek gelince uygulama veritabanına en basit sorguyu (`SELECT 1`, "bana 1 döndür") gönderir. Veritabanı 1 saniye içinde cevap verirse `200`, vermezse `503` döner. Uygulamanın kendisi kapalıysa istek hiç cevap alamaz.

```bash
curl http://localhost:3000/health
```

**Olası üç durum:**

| Durum | Ne görürsünüz | Anlamı |
|---|---|---|
| Her şey çalışıyor | `200 OK`, `"status": "ok"` | Uygulama açık ve veritabanına bağlanabiliyor; API kullanılabilir. |
| Uygulama çalışıyor, veritabanına ulaşılamıyor | `503 Service Unavailable`, `"status": "error"` | Uygulama açık ama iş yapamaz (veritabanı container'ı kapalı olabilir: [2.2, adım 3](#22-adım-adım-çalıştırma)). |
| Uygulama kapalı | Yanıt gelmez. curl: `Failed to connect to localhost port 3000 ... Couldn't connect to server`; tarayıcı: "Bu siteye ulaşılamıyor" | Uygulama başlatılmamış veya durmuş ([2.2, adım 6](#22-adım-adım-çalıştırma)). |

**Her şey yolundaysa — `200 OK`:**

```json
{ "status": "ok", "info": { "database": { "status": "up", "responseTime": 6 } }, "error": {}, "details": { "database": { "status": "up", "responseTime": 6 } } }
```

**Veritabanına ulaşılamıyorsa — `503 Service Unavailable`:**

```json
{ "status": "error", "info": {}, "error": { "database": { "status": "down", "message": "AggregateError", "responseTime": 3 } }, "details": { "database": { "status": "down", "message": "AggregateError", "responseTime": 3 } } }
```

**Yanıttaki alanlar:**

| Alan | Anlamı |
|---|---|
| `status` | Genel sonuç: `ok` (her şey çalışıyor) veya `error` (en az bir kontrol başarısız). |
| `info` | Başarılı olan kontroller. |
| `error` | Başarısız olan kontroller; her şey yolundaysa boştur (`{}`). |
| `details` | Tüm kontroller, başarılı ve başarısız birlikte. |
| `database.status` | Veritabanı kontrolünün sonucu: `up` (cevap verdi) veya `down` (cevap vermedi). |
| `database.responseTime` | Veritabanının kaç milisaniyede cevap verdiği. |
| `database.message` | Sadece `down` durumunda: bağlantı hatasının teknik adı. |

Bu projede tek kontrol veritabanıdır; ileride başka kontroller (ör. disk alanı) eklenirse her biri `info` / `error` / `details` altında kendi adıyla görünür.

[↑ İçindekiler](#icindekiler)

---

## 5. Veritabanı tabloları

Projede **3 tablo** var. Tablolar migration ile oluşturulur ([`src/database/migrations`](src/database/migrations)).

```
┌──────────────┐          ┌────────────────────┐
│    areas     │ 1      * │  area_entry_logs   │
│ (alanlar)    │◄─────────│ (giriş kayıtları)  │
└──────────────┘ area_id  └────────────────────┘

┌──────────────────────┐
│ user_location_states │   (kullanıcı başına son durum; diğer tablolara bağlı değil)
└──────────────────────┘
```

Bir alana birden çok giriş kaydı bağlanabilir (`1 → *`); her giriş kaydı `area_id` ile hangi alana ait olduğunu gösterir.

### `areas` — tanımlı alanlar

`POST /areas` ile eklenen her bölge bir satırdır.

| Kolon | Tip | Açıklama |
|---|---|---|
| `id` | sayı | Alanın numarası (otomatik) |
| `name` | metin (≤ 100) | Alanın adı, benzersiz |
| `polygon` | geometri | Alanın şekli (PostGIS tipi). Geçersiz şekil kaydedilemez. |
| `created_at` | zaman | Oluşturulma anı |

### `user_location_states` — her kullanıcının son durumu

Her kullanıcı için **tek satır** vardır ve her konum isteğinde güncellenir. Konum geçmişi saklanmaz; sadece "kullanıcı en son nerede ve hangi alanların içindeydi" bilgisi tutulur. Bir giriş olup olmadığını anlamak için bu yeterlidir: önceki konumda alanın dışında, şimdiki konumda içindeyse → giriş.

| Kolon | Tip | Açıklama |
|---|---|---|
| `user_id` | metin | Kullanıcı (her kullanıcıdan bir satır) |
| `latitude` / `longitude` | ondalık sayı | Son işlenen konum |
| `current_area_ids` | sayı listesi | Kullanıcının şu an içinde olduğu alanların id'leri |
| `last_timestamp` | zaman | Son işlenen konumun zamanı (eski ve tekrar gelen istekleri ayırt etmek için) |
| `updated_at` | zaman | Satırın son güncellenme anı |

### `area_entry_logs` — giriş kayıtları

Kullanıcı bir alana her girdiğinde bir satır eklenir. `GET /logs` bu tabloyu okur.

| Kolon | Tip | Açıklama |
|---|---|---|
| `id` | büyük sayı | Kayıt numarası (otomatik) |
| `user_id` | metin | Giren kullanıcı |
| `area_id` | sayı | Girilen alan → `areas.id` |
| `entry_time` | zaman | Giriş anı |
| `created_at` | zaman | Kaydın oluşturulma anı |

Aynı kullanıcı, aynı alan ve aynı zaman için ikinci bir kayıt oluşturulamaz (veritabanı kuralı); tekrar gelen istekler çift kayıt üretmez.

**Hız için index'ler:** Alan şekilleri için coğrafi bir index (GiST) var; "bu nokta hangi alanların içinde" sorusu alan sayısı arttıkça da hızlı kalır. Giriş kayıtları için `GET /logs`'un üç kullanım şekline (filtresiz, kullanıcıya göre, alana göre) uygun index'ler var.

[↑ İçindekiler](#icindekiler)

---

## 6. Sistem nasıl çalışıyor

### 6.1 Modüller

NestJS'te uygulama, her biri bir konudan sorumlu modüllere bölünür. Her modülde **controller** (HTTP isteklerini karşılayan ve yanıtı dönen katman) ve **service** (iş mantığının bulunduğu katman) bulunur.

| Modül | Görevi |
|---|---|
| `AreasModule` | Alanları doğrular, kaydeder, listeler |
| `LocationsModule` | Konumları işler, girişleri tespit eder (projenin çekirdeği) |
| `LogsModule` | Giriş kayıtlarını filtreleyip sayfalar |
| `HealthModule` | Sağlık kontrolü |
| `DatabaseModule` | Veritabanı bağlantı ayarları |

Gelen istekler önce **DTO** sınıflarıyla doğrulanır (örneğin "enlem -90 ile 90 arasında olmalı"). Hatalı istek iş mantığına ulaşmadan `400` alır.

[↑ İçindekiler](#icindekiler)

### 6.2 Bir konum geldiğinde ne oluyor

İstek önce [`LocationsController`](src/locations/locations.controller.ts)'a gelir; controller isteği DTO ile doğrulanmış haliyle [`LocationsService`](src/locations/locations.service.ts)'e verir ve aşağıdaki adımların hepsi service'te çalışır.

`POST /locations` isteği tek bir **transaction** içinde işlenir (adımların hepsi birlikte uygulanır ya da hiçbiri uygulanmaz):

1. **Kullanıcı kilitlenir.** Kullanıcının durum satırı kilitlenir. Aynı kullanıcıdan aynı anda iki istek gelirse ikincisi birincinin bitmesini bekler; böylece iki istek aynı girişi iki kez kaydedemez. Farklı kullanıcılar birbirini beklemez.
2. **Konumun hangi alanlarda olduğu bulunur.** PostGIS'e "bu nokta hangi polygon'ların içinde?" diye sorulur. Sınırın tam üzerindeki nokta içeride sayılır.
3. **Konum kontrol edilir.**
   - Son işlenen konumdan eskiyse → `stale_ignored`, hiçbir şey değişmez.
   - Aynı zaman + aynı konum → `duplicate_ignored`.
   - Aynı zaman + farklı konum → `409` hatası.
4. **Yeni girilen alanlar hesaplanır.** `şimdiki alanlar − önceki alanlar`. Örnek: önceden `[İstanbul]`, şimdi `[İstanbul, Kadıköy]` → yeni giriş: `[Kadıköy]`.
5. **Kayıt ve güncelleme.** Yeni girilen her alan için giriş kaydı yazılır; kullanıcının durum satırı yeni konumla güncellenir. Transaction tamamlanır, kilit kalkar.

Bu kurallar, veritabanından bağımsız küçük fonksiyonlar olarak ayrı bir dosyada: [`location-update.policy.ts`](src/locations/location-update.policy.ts).

**Neden kilit gerekli?** Aynı kullanıcının art arda gönderdiği iki konum aynı anda işlenebilir. Kilit olmasaydı iki istek de kullanıcının eski durumunu ("alanın dışında") okurdu. Kullanıcı alana bir kez girdiği halde iki giriş kaydı oluşurdu.

<details>
<summary>Teknik detay: kullanılan SQL</summary>

```sql
BEGIN;

-- 1 + 2: satırı kilitle, aynı sorguda noktayı kapsayan alanları bul (GiST index)
SELECT s.latitude, s.longitude, s.current_area_ids, s.last_timestamp,
       ARRAY(SELECT a.id FROM areas a
             WHERE ST_Covers(a.polygon, ST_SetSRID(ST_MakePoint($lon, $lat), 4326))
             ORDER BY a.id) AS area_ids
FROM user_location_states s
WHERE s.user_id = $userId
FOR UPDATE OF s;
-- (yeni kullanıcıysa: INSERT ... ON CONFLICT DO NOTHING, sonra aynı SELECT)

-- 3 + 4: eski / tekrar / çelişen konum kontrolü ve fark hesabı uygulama kodunda

-- 5: giriş kayıtları ve durum güncellemesi tek sorguda
WITH entry_logs AS (
  INSERT INTO area_entry_logs (user_id, area_id, entry_time)
  SELECT $userId, area_id, $timestamp FROM unnest($enteredIds::int[]) AS area_id
  ON CONFLICT (user_id, area_id, entry_time) DO NOTHING
)
UPDATE user_location_states
SET latitude = $lat, longitude = $lon, current_area_ids = $areaIds,
    last_timestamp = $timestamp, updated_at = now()
WHERE user_id = $userId;

COMMIT;
```

`ST_Covers` sınırın tam üzerindeki noktayı içeride sayar (`ST_Contains` saymaz). Böylece alanın sınırında duran bir kullanıcı, GPS'teki küçük sapmalar yüzünden sürekli "girdi-çıktı-girdi" diye kaydedilmez. Bu akışta veritabanına giden sorgu sayısı, performans ölçümleri sonucunda 7'den 4'e indirildi ([TESTING.md, bölüm 3](TESTING.md#3-performans-yavaşlığın-araştırılması-ve-testin-sınırları)).

</details>

[↑ İçindekiler](#icindekiler)

### 6.3 `GET /logs` sayfalaması neden cursor ile

Klasik sayfalamada (`?page=500`) veritabanı, istenen sayfaya ulaşmak için önceki 499 sayfanın kayıtlarını da okuyup atlar; kayıt sayısı milyonlara çıktıkça ileri sayfalar yavaşlar. Cursor yöntemi "en son gördüğüm kayıttan sonrakileri ver" der ve index sayesinde hangi sayfada olursanız olun aynı hızda çalışır. (Bu yöntemin genel adı "keyset pagination"dır.)

[↑ İçindekiler](#icindekiler)

---

## 7. Testler

Projede üç tür test var. Nasıl çalıştırıldıkları, ne doğruladıkları ve sonuçları ayrı bir dokümanda: **[TESTING.md](TESTING.md)**.

| Test türü | Komut | Ne doğrular |
|---|---|---|
| Unit testler | `npm test` | Giriş tespiti kuralları ve hata kodları, veritabanı olmadan |
| e2e (uçtan uca) testler | `npm run test:e2e` | Tüm endpoint'ler, gerçek PostgreSQL + PostGIS ile (Docker gerekli) |
| Performans testi | k6 (yük testi aracı) ([TESTING.md, bölüm 2](TESTING.md#2-performans-testi-k6)) | Binlerce kullanıcı altında hız, hata oranı ve kayıtların doğruluğu |

[↑ İçindekiler](#icindekiler)

---

## 8. Teknik tercihler

| Tercih | Neden |
|---|---|
| **PostgreSQL + PostGIS** | Case metni PostgreSQL istiyor. "Nokta hangi polygon'un içinde" hesabını PostGIS hem doğru (geometri kuralları, delikler, sınırlar) hem hızlı (coğrafi index) yapar; bu hesabı uygulama kodunda yazmak hem yavaş hem hataya açık olurdu. |
| **TypeORM** | Case metni TypeORM veya Prisma istiyor. Tablolar, kayıt/okuma işlemleri ve migration'lar için TypeORM kullanıldı. Saniyede binlerce kez çalışan konum işleme akışında ise SQL doğrudan (parametreli olarak) yazıldı: böylece kilitleme ile alan sorgusu tek sorguda birleştirilip veritabanına giden sorgu sayısı azaltıldı. |
| **Vitest** (test aracı) | NestJS 12 ile oluşturulan ES Module projelerinin varsayılan test aracı ([NestJS migration guide](https://docs.nestjs.com/migration-guide)). Jest bu projede ancak çok yeni Node.js sürümlerinde (24.9+) çalışabiliyor. |
| **Testcontainers** | Testler sahte değil gerçek PostGIS üzerinde çalışsın diye; coğrafi davranış sahte (mock) bir veritabanıyla doğrulanamaz. |
| **Docker Compose** | Veritabanını tek komutla, herkeste aynı versiyonla başlatmak için. |
| **Migration'lar ayrı komutla** | Bkz. [2.5](#25-faydalı-komutlar). |
| **Redis / Kafka yok** | Ölçümlerde sistemi yavaşlatan nokta bunlarla çözülecek bir sorun değildi. Gereksiz her bileşen bakım yükü ve veri tutarlılığı riski ekler. Ne zaman gerekebileceği: [bölüm 10](#10-kapsam-dışı-ve-geliştirme-yolu). |
| **`imresamu/postgis` Docker image'ı** | Resmi `postgis/postgis` image'ı sadece Intel/AMD işlemciler için yayınlanıyor; bu image aynı geliştiricinin Apple Silicon (M1/M2/M3) dahil her işlemcide çalışan sürümü. |

[↑ İçindekiler](#icindekiler)

---

## 9. Varsayımlar

Case metninde açıkça belirtilmeyen konularda yapılan varsayımlar:

- **Zaman, telefonun gönderdiği zamandır.** Sıralama ve giriş anı için `timestamp` kullanılır ve gönderilmesi zorunludur. Sunucunun saati kullanılmaz, çünkü gecikmeli veya tekrar gönderilen isteklerde konumun ölçüldüğü anı değil, sunucuya ulaştığı anı gösterir; bu da sıralamayı ve tekrar tespitini bozar. Saat dilimi zorunludur; saat dilimi olmayan bir zamanın hangi saat dilimine ait olduğu belirsizdir.
- **Zaman, şu andan en fazla 60 saniye ileride olabilir.** Telefonun saati biraz ileri olabileceği için bu kadarına izin verilir. Çok ileri bir zaman kabul edilseydi, kullanıcının sonraki tüm gerçek konumları "eski" sayılıp yok sayılırdı.
- **Sadece giriş kaydedilir.** Case metni giriş kaydı istiyor; çıkış ayrıca kaydedilmez. Çıkış bilgisi kullanıcının durum satırında tutulur ve tekrar girişin doğru tespit edilmesini sağlar.
- **İlk konum da giriş sayılır.** Kullanıcının ilk gönderdiği konum bir alanın içindeyse o alan için giriş kaydı oluşur.
- **Bir kullanıcı aynı anda birden fazla alanda olabilir.** İç içe / örtüşen alanların her birine giriş ayrı kaydedilir.
- **Alanlar sonradan değişmez.** Alan güncelleme / silme endpoint'i yok (case metni istemiyor).
- **`userId` metin olarak gelir ve güvenilir kabul edilir.** Kimlik doğrulama kapsam dışı ([bölüm 10](#10-kapsam-dışı-ve-geliştirme-yolu)).
- **Alan şekli sadece `Polygon`'dur.** Birden fazla parçadan oluşan alanlar (`MultiPolygon`) desteklenmez; gerekirse ayrı alanlar olarak tanımlanabilir.

[↑ İçindekiler](#icindekiler)

---

## 10. Kapsam dışı ve geliştirme yolu

**Trafik çok artarsa sırasıyla:**

1. **Giriş kayıtları tablosunu bölmek (partitioning).** Bu tablo sürekli büyür. Tablo aylara göre parçalara bölünürse eski aylar kolayca arşivlenebilir veya silinebilir. Ayrıca `GET /logs` okumaları ana veritabanının bir kopyasına (read replica) yönlendirilerek ana veritabanının yükü azaltılabilir.
2. **Çok sayıda / çok karmaşık alan.** Polygon'lar sadeleştirilebilir veya küçük parçalara bölünebilir.
3. **Ani ve çok büyük trafik dalgaları.** Veritabanının anlık olarak kaldıramayacağı kadar istek gelirse, istekler önce bir kuyruğa (örn. Kafka) yazılıp veritabanında sırayla işlenebilir; bu durumda aynı kullanıcının konumlarının sırası korunmalıdır. Mevcut ölçümler buna ihtiyaç göstermedi.

**Canlı ortam için gerekli ama bu projede kapsam dışı bırakılanlar:**

- **Kimlik doğrulama:** Şu an `userId` istekte açıkça gönderiliyor. Gerçek sistemde kullanıcının oturum bilgisinden (token) alınmalı ki kimse başkası adına konum gönderemesin.
- **İstek sınırlama (rate limiting):** Bir kullanıcının veya hatalı çalışan bir uygulamanın saniyede çok fazla istek göndererek sistemi yormasını engellemek.
- **İzleme:** Anlık istek sayısı, hata oranı ve gecikme gibi metrikler; bir isteğin sistemin hangi aşamasında ne kadar beklediğini gösteren izleme (tracing); aranabilir loglar.
- **Alan güncelleme / silme**, **çıkış kayıtları**, **telefonun konumları toplu göndermesi.**
- **Otomatik test ve dağıtım hattı (CI/CD)** ve uygulamanın kendisi için Docker image'ı.

[↑ İçindekiler](#icindekiler)

---

## 11. Proje yapısı

```
src/
  main.ts               Uygulamanın başlangıç noktası (Swagger, HTTP ayarları)
  app.module.ts         Tüm modülleri bir araya getirir
  app.controller.ts     GET / (ana adres): servisin adı ve faydalı adresler
  app.setup.ts          İstek doğrulama ve hata yönetimi ayarları (uygulama ve testler ortak kullanır)
  entities/             3 tablonun TypeScript karşılıkları (areas, user_location_states, area_entry_logs)
  areas/                POST/GET /areas: controller, service, DTO'lar + polygon doğrulayıcı
  locations/            POST /locations: controller, service, giriş kuralları, DTO'lar
  logs/                 GET /logs: controller, service, sayfalama (cursor), DTO'lar
  health/               GET /health
  common/               Ortak parçalar: hata yanıtı şeması, hataları HTTP koduna çeviren filtre, NUL karakter kontrolü
  database/             Veritabanı bağlantı ayarları ve migration'lar
test/                   e2e testleri ve test veritabanı kurulumu
load/                   k6 yük testi senaryosu (locations.js) ve macOS script'leri (.sh)
TESTING.md              Testlerin nasıl çalıştırıldığı, sonuçları ve performans raporu
docker-compose.yml      PostgreSQL + PostGIS
.env.example            Varsayılan ayarlar (.env dosyasının şablonu)
```

[↑ İçindekiler](#icindekiler)
