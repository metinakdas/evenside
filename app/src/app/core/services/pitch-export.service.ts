import { Injectable, inject } from '@angular/core';
import { keeperJerseyColor } from '../constants/keeper-jersey';
import { environment } from '../../../environments/environment';
import { MatchDetails } from '../models/match-details.model';
import { KeeperRotation, KeeperRotationPlan } from '../models/keeper-rotation.model';
import { trUpper } from '../utils/turkish-text';
import { takimAdiGoster } from '../utils/team-name';
import { SquadFormat } from '../models/draw.model';
import { Player } from '../models/player.model';
import { PitchSlot } from '../models/pitch.model';
import { TeamInfo } from '../models/team.model';
import { FormationLines, PitchService } from './pitch.service';
import { I18nService, mesaj } from './i18n.service';

/**
 * Bu görsel PNG çıktısına çizilebilir mi?
 *
 * - `data:` URL'ler (kullanıcının yüklediği fotoğraf/logo) her zaman çizilebilir.
 * - Uzak URL'ler (TheSportsDB arması/forması) yalnızca CORS proxy'si TANIMLIYSA çizilebilir;
 *   proxy yoksa canvas "tainted" olur ve tüm indirme SecurityError ile çöker.
 */
function isExportableImage(src: string | null | undefined): src is string {
  if (!src) return false;
  return src.startsWith('data:') || (!!environment.imageProxyUrl && /^https?:/.test(src));
}

/** `TeamLineupCardComponent`'teki izometrik yerleşimle AYNI formül — ikisi senkron kalmalı. */
const TOP_WIDTH_FACTOR = 0.76;
const DEVICE_SCALE = 2;

/**
 * Bir takımın kadro haritasını (bkz. `TeamLineupCardComponent`) harici kütüphane
 * kullanmadan PNG olarak dışa aktarır — sahayı, forma/foto ikonlarını ve isim
 * etiketlerini doğrudan Canvas 2D API ile çizer. Kartın tam DOM/CSS temsili değil,
 * sade bir özetidir (izometrik eğim atlanır — düz bir sahaya çizilir).
 */
@Injectable({ providedIn: 'root' })
export class PitchExportService {
  /** PNG başlığındaki tarih/saat seçili dile göre biçimlenir. */
  private readonly i18n = inject(I18nService);

  private readonly pitchService = inject(PitchService);

  /** Bu dışa aktarımda geçerli ayırt edici isimler (id → "H. DOĞAN"). */
  private labels: Record<string, string> = {};

  /** Her iki takımın kadro haritasını TEK bir PNG'de yan yana dışa aktarır (bkz. kullanıcı isteği). */
  async exportLineups(
    teamA: TeamInfo,
    playersA: readonly Player[],
    formationLinesA: FormationLines,
    showRatingA: boolean,
    teamB: TeamInfo,
    playersB: readonly Player[],
    formationLinesB: FormationLines,
    showRatingB: boolean,
    format: SquadFormat,
    filename = 'saha42-kadro.png',
    rotationPlan: KeeperRotationPlan = { A: null, B: null },
    details: MatchDetails | null = null,
    /**
     * id → ayırt edici isim ("H. DOĞAN"). Ekranda kullanılıyordu ama PNG'ye geçmiyordu:
     * aynı takımdaki iki "ŞİMŞEK" görselde birbirinden ayrılmıyordu (tarayıcı test raporu).
     */
    nameLabels: Record<string, string> = {},
  ): Promise<boolean> {
    this.labels = nameLabels;
    try {
      const panelW = 640;
      const panelH = 800;
      const gap = 20;
      // Paneller kenara yapışmasın: zemin (stadyum) çerçeve gibi görünsün.
      const pad = 18;
      // Maç bilgisi verildiyse görselin üstünde bir başlık bandı açılır.
      const headerH = this.headerHeight(details);
      const W = panelW * 2 + gap + pad * 2;
      const H = panelH + headerH + pad;
      const canvas = document.createElement('canvas');
      canvas.width = W * DEVICE_SCALE;
      canvas.height = H * DEVICE_SCALE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.scale(DEVICE_SCALE, DEVICE_SCALE);

      await this.drawBackdrop(ctx, W, H);
      this.drawHeader(ctx, W, headerH, teamA, teamB, details);

      ctx.save();
      ctx.translate(pad, headerH);
      await this.drawTeamPanel(ctx, 0, panelW, panelH, teamA, playersA, format, formationLinesA, showRatingA, rotationPlan.A);
      await this.drawTeamPanel(
        ctx,
        panelW + gap,
        panelW,
        panelH,
        teamB,
        playersB,
        format,
        formationLinesB,
        showRatingB,
        rotationPlan.B,
      );
      ctx.restore();

      this.drawVsBadge(ctx, pad + panelW + gap / 2, headerH + panelH / 2);

      const blob = await this.canvasToBlob(canvas);
      if (!blob) return false;
      this.triggerDownload(URL.createObjectURL(blob), filename);
      return true;
    } catch (error) {
      console.error('Evenside: kadro görseli oluşturulamadı.', error);
      return false;
    }
  }

  /** "KALECİ SIRASI · 1. POLAT · 2. KAYA" satırı — sahanın alt kenarına oturur. */
  private drawKeeperRotation(
    ctx: CanvasRenderingContext2D,
    rotation: KeeperRotation,
    x: number,
    panelH: number,
    width: number,
  ): void {
    const text = `KALECİ SIRASI (${rotation.periods} PERİYOT) · ${rotation.order
      .map((p, i) => `${i + 1}. ${this.labelOf(p)}`)
      .join(' · ')}`;
    const y = panelH - 30;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(x, y - 16, width, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 13px "Space Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y - 4, width - 16);
    ctx.restore();
  }

  private async drawTeamPanel(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    panelW: number,
    panelH: number,
    team: TeamInfo,
    players: readonly Player[],
    format: SquadFormat,
    formationLines: FormationLines,
    showRating: boolean,
    rotation: KeeperRotation | null = null,
  ): Promise<void> {
    ctx.save();
    ctx.translate(offsetX, 0);

    // Panel: yarı saydam koyu zemin + ince mavi kenar (ekrandaki `/pitch` kartlarıyla aynı dil).
    const bg = ctx.createLinearGradient(0, 0, 0, panelH);
    bg.addColorStop(0, 'rgba(18, 52, 32, 0.94)');
    bg.addColorStop(1, 'rgba(4, 19, 10, 0.96)');
    ctx.save();
    this.roundedRect(ctx, 0, 0, panelW, panelH, 14);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 130, 220, 0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.clip();

    // Başlık bandı takım renginde: ekrandaki kadro haritası kartının şeridiyle aynı.
    const headBand = ctx.createLinearGradient(0, 0, panelW, 0);
    headBand.addColorStop(0, team.color);
    headBand.addColorStop(1, this.withAlpha(team.color, 0.15));
    ctx.fillStyle = headBand;
    ctx.fillRect(0, 0, panelW, 76);

    await this.drawTeamHeader(ctx, team, panelW);
    ctx.restore();

    const pitchX = 24;
    const pitchY = 96;
    const pitchW = panelW - 48;
    const pitchH = panelH - pitchY - 24;
    this.drawTeamMarkings(ctx, pitchX, pitchY, pitchW, pitchH);

    const slots = this.pitchService.assignSlots(format, 'A', players, formationLines);
    for (const slot of slots) {
      if (!slot.player) continue;
      await this.drawTeamMarker(ctx, slot, team, pitchX, pitchY, pitchW, pitchH, showRating);
    }

    // Kale sırası görselin İÇİNDE yazar: sahada telefon açmadan kimin ne zaman kaleye
    // geçeceği belli olsun, tartışma çıkmasın (kontrol raporu Ö3/4).
    if (rotation) this.drawKeeperRotation(ctx, rotation, pitchX, panelH, pitchW);

    ctx.restore();
  }

  private async drawTeamHeader(ctx: CanvasRenderingContext2D, team: TeamInfo, width: number): Promise<void> {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 700 26px "Saira Condensed", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(takimAdiGoster(team.name) || mesaj('ui.adsizTakim'), 24, 48);

    const r = 26;
    const cx = width - 24 - r;
    const cy = 48;
    if (isExportableImage(team.logoImage)) {
      try {
        const img = await this.loadImage(team.logoImage as string);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
        ctx.restore();
        return;
      } catch {
        // logo yüklenemezse baş harflere düş
      }
    }
    ctx.beginPath();
    ctx.fillStyle = team.color;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 16px sans-serif';
    ctx.textAlign = 'center';
    const words = team.name.trim().split(/\s+/).filter(Boolean);
    const initials = trUpper(words.map((w) => w[0]).join('').slice(0, 3) || '??');
    ctx.fillText(initials, cx, cy + 1);
  }

  private drawTeamMarkings(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    // Çim: düz koyu yeşil yerine hafif bir derinlik + şerit deseni (ekrandaki sahaya yakın).
    const grass = ctx.createLinearGradient(x, y, x, y + h);
    grass.addColorStop(0, '#14452a');
    grass.addColorStop(1, '#0a2616');
    ctx.fillStyle = grass;
    ctx.fillRect(x, y, w, h);

    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#ffffff';
    const stripe = h / 8;
    for (let i = 0; i < 8; i += 2) ctx.fillRect(x, y + i * stripe, w, stripe);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

    const boxW = w * 0.5;
    const boxH = h * 0.2;
    ctx.strokeRect(x + (w - boxW) / 2, y, boxW, boxH);
    const areaW = w * 0.24;
    const areaH = h * 0.08;
    ctx.strokeRect(x + (w - areaW) / 2, y, areaW, areaH);

    const halfY = y + h * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, halfY);
    ctx.lineTo(x + w, halfY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x + w / 2, halfY, h * 0.15, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  /** `TeamLineupCardComponent.slots()` ile AYNI izometrik dönüşüm. */
  private displayPosition(slot: PitchSlot, w: number, h: number): { x: number; y: number } {
    const displayYPercent = 8 + ((slot.y - 7) / 36) * 78;
    const factor = TOP_WIDTH_FACTOR + (1 - TOP_WIDTH_FACTOR) * (displayYPercent / 100);
    const displayXPercent = 50 + (slot.x - 50) * factor;
    return { x: (displayXPercent / 100) * w, y: (displayYPercent / 100) * h };
  }

  private async drawTeamMarker(
    ctx: CanvasRenderingContext2D,
    slot: PitchSlot,
    team: TeamInfo,
    pitchX: number,
    pitchY: number,
    pitchW: number,
    pitchH: number,
    showRating: boolean,
  ): Promise<void> {
    const player = slot.player;
    if (!player) return;
    const pos = this.displayPosition(slot, pitchW, pitchH);
    const cx = pitchX + pos.x;
    const cy = pitchY + pos.y;
    const size = pitchW * 0.15;
    const jerseyColor = slot.mevki === 'KAL' ? keeperJerseyColor(team.color) : team.color;

    let drewPhoto = false;
    if (isExportableImage(player.input.photoImage)) {
      try {
        const img = await this.loadImage(player.input.photoImage);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
        ctx.restore();
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.stroke();
        drewPhoto = true;
      } catch {
        drewPhoto = false;
      }
    }
    // Kulüp forması: ekrandaki kadro haritasıyla aynı kural — kaleci kulüp forması giymez,
    // düz `KEEPER_JERSEY_COLOR` vektör formada kalır. Uzak forma görseli yalnızca CORS
    // proxy'si tanımlıysa çizilebilir (bkz. isExportableImage).
    let drewKit = false;
    const kitImage = slot.mevki === 'KAL' ? team.keeperKitImage : team.kitImage;
    if (!drewPhoto && isExportableImage(kitImage)) {
      try {
        const kit = await this.loadImage(kitImage);
        const kitH = size * 1.06;
        const kitW = (kit.naturalWidth / kit.naturalHeight) * kitH;
        ctx.drawImage(kit, cx - kitW / 2, cy - kitH * 0.5, kitW, kitH);
        drewKit = true;
      } catch {
        drewKit = false;
      }
    }

    if (!drewPhoto && !drewKit) {
      // PNG çıktısında forma NUMARASI yok (kullanıcı isteği): isim etiketi zaten altında ve
      // numara gerçek formanın üstünde okunmuyordu. Ekrandaki kadro haritasında numara duruyor.
      this.drawJersey(ctx, cx, cy, size, jerseyColor, '');
    }

    if (showRating) {
      ctx.beginPath();
      ctx.fillStyle = '#00F57A';
      this.roundedRect(ctx, cx - size / 2 - 2, cy - size / 2 - 12, 30, 16, 8);
      ctx.fill();
      ctx.fillStyle = '#0b0b0d';
      ctx.font = 'italic 900 11px "Saira Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.ratings.overall), cx - size / 2 + 13, cy - size / 2 - 4);
    }

    const surname = this.labelOf(player);
    ctx.font = 'italic 900 12px "Saira Condensed", sans-serif';
    const textW = ctx.measureText(surname).width;
    const tagW = textW + 16;
    const tagY = cy + size / 2 + 8;
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    this.roundedRect(ctx, cx - tagW / 2, tagY, tagW, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#101012';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(surname, cx, tagY + 9);

    if (slot.fit === 'shifted') {
      ctx.beginPath();
      ctx.fillStyle = '#F5A623';
      ctx.arc(cx - tagW / 2 + 5, tagY + 9, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawJersey(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, shirtNumber: string): void {
    const scale = size / 60;
    ctx.save();
    ctx.translate(cx - size / 2, cy - size * 0.53);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(12, 10);
    ctx.lineTo(22, 2);
    ctx.lineTo(30, 8);
    ctx.lineTo(38, 2);
    ctx.lineTo(48, 10);
    ctx.lineTo(48, 20);
    ctx.lineTo(41, 24);
    ctx.lineTo(41, 62);
    ctx.lineTo(19, 62);
    ctx.lineTo(19, 24);
    ctx.lineTo(12, 20);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    this.drawShirtNumber(ctx, cx, cy, size, shirtNumber);
  }

  /** Formanın üstündeki numara — vektör formada da kulüp formasında da aynı yerde durur. */
  private drawShirtNumber(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, shirtNumber: string): void {
    if (!shirtNumber) return;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = `italic 900 ${Math.round(size * 0.3)}px "Saira Condensed", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Kulüp forması basıldığında numara okunsun diye ince bir kontur.
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.strokeText(shirtNumber, cx, cy + size * 0.06);
    ctx.fillText(shirtNumber, cx, cy + size * 0.06);
    ctx.restore();
  }

  /**
   * PNG'ye çizilebilir mi? Uzak (http) görseller CORS başlığı olmadan geldiği için canvas'ı
   * "tainted" yapar ve `toBlob`/`toDataURL` SecurityError fırlatır — yani tüm indirme
   * çöker. TheSportsDB'den seçilen arma/forma böyle (ölçüldü, bkz. SportsDbService), bu
   * yüzden çıktıda onların yerine takım rengi + baş harfler / vektör forma kullanılır.
   */

  /**
   * Görselin zemini: stadyum fotoğrafı + koyu perde + ışık huzmeleri — `/pitch` ekranının
   * atmosferi (kullanıcı isteği: "indirilen görsel çok sade"). Fotoğraf kendi origin'imizde
   * (`public/stadium.jpg`) olduğu için canvas'ı kirletmez.
   */
  private async drawBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): Promise<void> {
    ctx.fillStyle = '#080a12';
    ctx.fillRect(0, 0, width, height);

    try {
      const photo = await this.loadImage('stadium.jpg');
      const scale = Math.max(width / photo.naturalWidth, height / photo.naturalHeight);
      const w = photo.naturalWidth * scale;
      const h = photo.naturalHeight * scale;
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(photo, (width - w) / 2, (height - h) * 0.42, w, h);
      ctx.restore();
    } catch {
      // Fotoğraf yoksa düz koyu zemin kalır.
    }

    // Gece lacivertine çeken perde (ekrandaki `.page__scrim` ile aynı fikir).
    const scrim = ctx.createLinearGradient(0, 0, 0, height);
    scrim.addColorStop(0, 'rgba(4, 7, 22, 0.86)');
    scrim.addColorStop(0.35, 'rgba(6, 10, 32, 0.62)');
    scrim.addColorStop(1, 'rgba(3, 5, 14, 0.94)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width / 2, 0, 0, width / 2, 0, width * 0.62);
    glow.addColorStop(0, 'rgba(35, 85, 220, 0.3)');
    glow.addColorStop(1, 'rgba(35, 85, 220, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Tepeden süzülen ışık huzmeleri.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const [x, tilt, alpha] of [
      [0.22, -0.16, 0.07],
      [0.42, -0.06, 0.05],
      [0.6, 0.06, 0.05],
      [0.8, 0.16, 0.07],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(width * x, 0);
      ctx.lineTo(width * (x + 0.05), 0);
      ctx.lineTo(width * (x + 0.05 + tilt), height);
      ctx.lineTo(width * (x + tilt), height);
      ctx.closePath();
      ctx.fillStyle = `rgba(190, 215, 255, ${alpha})`;
      ctx.fill();
    }
    ctx.restore();
  }

  /** İki panelin arasındaki VS rozeti — ekrandaki `/pitch` görünümünün aynısı. */
  private drawVsBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    const r = 30;
    ctx.save();
    const fill = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, 2, cx, cy, r);
    fill.addColorStop(0, 'rgba(46, 68, 130, 0.95)');
    fill.addColorStop(1, 'rgba(8, 10, 22, 0.97)');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 160, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 20px "Saira Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', cx, cy + 1);
    ctx.restore();
  }

  /** `#rrggbb` + alfa → `rgba(...)`; takım rengini şeffaflaştırmak için. */
  private withAlpha(hex: string, alpha: number): string {
    const value = hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /** Maç bilgisi yoksa başlık bandı hiç açılmaz. */
  private headerHeight(details: MatchDetails | null): number {
    return details && (details.venue || details.kickoff) ? 148 : 0;
  }

  /**
   * Başlık bandı: ortada "A — B", altında tarih · saat · saha. Tarih `yyyy-mm-dd` olarak
   * geliyor; görselde Türkçe okunuşa çevrilir (12 Eylül 2026 Cumartesi).
   */
  private drawHeader(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    teamA: TeamInfo,
    teamB: TeamInfo,
    details: MatchDetails | null,
  ): void {
    if (!height || !details) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 34px "Saira Condensed", Arial, sans-serif';
    ctx.fillText(`${trUpper(takimAdiGoster(teamA.name) || mesaj('kadro.takimTaraf', { taraf: 'A' }))}  —  ${trUpper(takimAdiGoster(teamB.name) || mesaj('kadro.takimTaraf', { taraf: 'B' }))}`, width / 2, 50);

    // Tarih/saat ve konum ÇİP olarak çizilir: görselin başlığında en çok aranan bilgi bu,
    // gri bir alt satır olarak kaybolmasın (kullanıcı isteği: "daha vurgulu olsun").
    const kickoff = this.formatKickoff(details.kickoff);
    const chips = [kickoff, details.venue.trim()].filter((c) => !!c);
    if (!chips.length) {
      ctx.restore();
      return;
    }

    ctx.font = '700 19px "Barlow", Arial, sans-serif';
    const padX = 18;
    const chipH = 40;
    const gap = 12;
    const widths = chips.map((c) => ctx.measureText(c).width + padX * 2);
    let x = (width - (widths.reduce((s, w) => s + w, 0) + gap * (chips.length - 1))) / 2;
    const y = 76;

    chips.forEach((text, i) => {
      const w = widths[i];
      ctx.beginPath();
      this.roundedRect(ctx, x, y, w, chipH, chipH / 2);
      // İlk çip (vakit) vurgu yeşili, ikincisi (saha) nötr: ikisi aynı ağırlıkta olursa
      // hiçbiri öne çıkmıyor.
      ctx.fillStyle = i === 0 ? 'rgba(0, 245, 122, 0.16)' : 'rgba(255, 255, 255, 0.08)';
      ctx.fill();
      ctx.strokeStyle = i === 0 ? 'rgba(0, 245, 122, 0.55)' : 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = i === 0 ? '#7dffbc' : '#e9e9ee';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + chipH / 2 + 1);
      x += w + gap;
    });

    ctx.restore();
  }

  /**
   * `2026-09-13T21:00` → `13 Eylül 2026 Pazar · 21:00`. Geçersiz/boş değer olduğu gibi döner.
   */
  private formatKickoff(value: string): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    const date = parsed.toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
    });
    const time = parsed.toLocaleTimeString(this.i18n.locale(), { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  }

  /**
   * Uzak görseller proxy üzerinden ve `crossOrigin="anonymous"` ile yüklenir — ancak böyle
   * yüklenen bir görsel canvas'ı kirletmez. `data:` URL'ler doğrudan yüklenir.
   */
  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      if (src.startsWith('data:')) {
        img.src = src;
        return;
      }
      img.crossOrigin = 'anonymous';
      img.src = environment.imageProxyUrl + encodeURIComponent(src);
    });
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  private roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Etiket varsa o basılır (ayırt edici), yoksa soyadı. */
  private labelOf(player: Player): string {
    const label = this.labels[player.id];
    return label ? trUpper(label) : this.surnameOf(player.input.name);
  }

  private surnameOf(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return trUpper(parts.length ? parts[parts.length - 1] : mesaj('ui.oyuncu'));
  }

  private triggerDownload(objectUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}
