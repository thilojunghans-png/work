# THE44 – App für die Kapitalanlage Hasseer Straße 44, Kiel

Mobile Web-App (PWA) für Bau, Buchhaltung, Dokumente und Vermietung einer Eigentumswohnung.
Sie läuft ohne Server und Konto: Alle Daten liegen lokal auf dem Gerät (IndexedDB) und funktionieren offline.

## Funktionen

| Bereich | Inhalt |
| --- | --- |
| **Übersicht** | Status Bauphase/Vermietung, Countdown zur Übergabe, Kaufpreis-Fortschritt, Kennzahlen, neueste Baufotos, nächste Termine |
| **Bau → Fotos** | Update-Fotos (Mehrfachauswahl) mit Datum, Bauabschnitt und Notiz; automatisch verkleinert; Vollbild mit Wischen und Teilen |
| **Bau → Zahlungsplan** | MaBV-Ratenplan (§ 3 Abs. 2 MaBV) als Vorlage; Status ausstehend/abgerufen/bezahlt; bezahlte Raten werden automatisch gebucht |
| **Finanzen → Buchungen** | Einnahmen/Ausgaben mit Kategorie, steuerlicher Zuordnung und Beleg (Foto/PDF) |
| **Finanzen → Auswertung** | Anlage-V-Übersicht pro Jahr, AfA (linear/degressiv, zeitanteilig), Summen je Kategorie, CSV-Export für den Steuerberater |
| **Finanzen → Darlehen** | Monatsrate, Restschuld heute und zum Ende der Zinsbindung, Zinsen im laufenden Jahr |
| **Dokumente** | Kaufvertrag, Baubeschreibung, Pläne, Protokolle usw. nach Kategorien, durchsuchbar, Ansicht und Teilen |
| **Mehr** | Aufgaben, Termine (Kalender-Export als .ics) und Mängel mit Fotos; Vermietung mit Mieteingängen pro Monat; Kontakte; Objektdaten; Backup |

## Auf dem iPhone nutzen

1. Die App über HTTPS bereitstellen (siehe unten) und die URL in **Safari** öffnen.
2. **Teilen → „Zum Home-Bildschirm“**.
3. Danach startet THE44 im Vollbild und offline. Auf dem Home-Bildschirm bleiben die Daten dauerhaft gespeichert.
   Ein normaler Safari-Tab kann Daten nach längerer Nichtnutzung löschen.

**Backup:** Unter *Mehr → Daten & Backup* entsteht eine Datei mit allen Daten, Fotos und Dokumenten.
Sichere sie z. B. in iCloud Drive. Über dieselbe Seite lässt sie sich auf einem neuen Gerät wiederherstellen.

## Bereitstellen

Es ist reines HTML/CSS/JavaScript ohne Build-Schritt.

- **GitHub Pages:** *Settings → Pages → Deploy from branch*. Die App liegt dann unter `…github.io/work/the44/`.
  Für private Repositories braucht GitHub Pages einen kostenpflichtigen Plan.
- **Alternativ:** Den Ordner `the44/` auf Netlify, Cloudflare Pages o. Ä. hochladen.
- **Lokal testen:** `cd the44 && python3 -m http.server 8044` und dann `http://localhost:8044` öffnen.

Nach Änderungen an Dateien die Versionsnummer `CACHE` in `sw.js` erhöhen, damit installierte Apps das Update laden.

## Aufbau

```
the44/
├── index.html            App-Shell mit Tab-Leiste
├── styles.css            Design (hell/dunkel)
├── sw.js                 Offline-Cache
├── manifest.webmanifest  Installation als App
├── icons/
└── js/
    ├── app.js            Routing und Aktionen
    ├── db.js             IndexedDB
    ├── data.js           Fachlogik (Dateien, AfA, Darlehen)
    ├── backup.js         Export und Import
    ├── config.js         Kategorien, MaBV-Plan, Steuer-Zuordnung
    ├── ui.js             Formulare, Auswahl-Sheets, Viewer
    ├── util.js, icons.js
    └── views/            home, bau, finanzen, dokumente, mehr
```

Steuerliche Berechnungen sind vereinfacht und ersetzen keine Steuerberatung.
