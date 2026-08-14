# Sonic 2D Platformer (Web)

Platformer gaya Sonic 2D berbasis web (HTML5 Canvas + Vanilla JavaScript, tanpa library), dengan fisika momentum ala *Sonic Physics Guide* (SPG) dan level **Emerald Hill Zone Act 1** dari Sonic the Hedgehog 2.

🎮 **Mainkan sekarang**: https://meizano.github.io/sonic-2d-platformer/

## Fitur

- Fisika momentum SPG 16-bit: akselerasi bertahap, friction, skid, lereng & loop 360°
- Spin Dash (tahan tombol turun + loncat, lalu lepas)
- Variable jump height (tahan tombol loncat lebih lama = lompat lebih tinggi)
- Rolling / ball form saat menurun atau melompat dengan kecepatan tinggi
- Musuh khas Sonic: Crawl, Buzzer, Coconuts, Masher
- Loop 360°, pit air, jembatan kayu one-way, spring, spike, checkpoint
- Ring (koleksi + scatter saat terkena musuh)
- Signpost & Stage Clear dengan bonus waktu + bonus ring
- BGM & efek suara disintesis via Web Audio API
- Skor terakhir disimpan di localStorage
- Dukungan input: Keyboard, Gamepad (Xbox/DS4 dll), dan Touch (DPad virtual di layar)
- Responsif untuk berbagai rasio layar

## Kontrol

| Aksi | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Gerak kiri/kanan | `A` / `D` (atau panah) | DPad / stick kiri | DPad kiri/kanan |
| Lompat / Spin Dash | `Space` | Tombol A (bawah) | Tombol B |
| Turun / Crouch | `S` | Tombol B (bawah) | DPad bawah |

Spin Dash: tahan `S` (crouch) lalu tekan `Space` berulang untuk mengisi daya, lepaskan `S` untuk meluncur.

## Cara menjalankan

Buka `index.html` di browser modern (Chrome, Edge, Firefox, Safari), atau jalankan server statis:

```sh
python -m http.server 8000
# lalu buka http://localhost:8000
```

## Struktur file

```
├── index.html   # markup layar (title, options, HUD, stage clear, touch)
├── style.css    # styling & layout responsif
└── game.js      # engine lengkap: input, fisika SPG, level, rendering
```

## Level

Emerald Hill Zone Act 1 (terrain, musuh, ring, dan objek dimuat dari data level di `game.js`).

## Lisensi

Proyek fan-made non-komersial. Sonic the Hedgehog adalah merek dagang milik SEGA. Proyek ini tidak berafiliasi dengan SEGA.
