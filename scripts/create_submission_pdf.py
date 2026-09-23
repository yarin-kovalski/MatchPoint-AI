from __future__ import annotations

import os
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
OUTPUT.mkdir(parents=True, exist_ok=True)
PDF_PATH = OUTPUT / "MatchPoint-AI-Final-Submission.pdf"
VIDEO_URL = os.environ.get("MATCHPOINT_VIDEO_URL", "PASTE PUBLIC GOOGLE DRIVE VIDEO LINK HERE")
GITHUB_URL = "https://github.com/yarin-kovalski/Assignment4_exe3"
KANBAN_URL = "https://trello.com/b/892SCMYP/matchpoint-ai-final-project"

NAVY = colors.HexColor("#071B20")
TEAL = colors.HexColor("#16343D")
LIME = colors.HexColor("#D8EF7B")
CREAM = colors.HexColor("#F5F5EA")
INK = colors.HexColor("#17292E")
MUTED = colors.HexColor("#5E7478")
LINE = colors.HexColor("#D5DEDA")
PALE = colors.HexColor("#F1F5F0")


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, 14 * mm, doc.pagesize[0] - doc.rightMargin, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(doc.leftMargin, 9 * mm, "MATCHPOINT AI / FINAL PROJECT 2026")
    canvas.drawRightString(doc.pagesize[0] - doc.rightMargin, 9 * mm, f"{doc.page}")
    canvas.restoreState()


portrait_frame = Frame(18 * mm, 18 * mm, A4[0] - 36 * mm, A4[1] - 34 * mm, id="portrait")
landscape_size = landscape(A4)
landscape_frame = Frame(12 * mm, 18 * mm, landscape_size[0] - 24 * mm, landscape_size[1] - 34 * mm, id="landscape")
doc = BaseDocTemplate(
    str(PDF_PATH),
    pagesize=A4,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    topMargin=18 * mm,
    bottomMargin=18 * mm,
    title="MatchPoint AI - Final Submission",
    author="Yarin Kovalski",
)
doc.addPageTemplates([
    PageTemplate(id="Portrait", pagesize=A4, frames=[portrait_frame], onPage=footer),
    PageTemplate(id="Landscape", pagesize=landscape_size, frames=[landscape_frame], onPage=footer),
])

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Kicker", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=LIME, spaceAfter=6, tracking=1.8))
styles.add(ParagraphStyle(name="Hero", fontName="Helvetica-Bold", fontSize=34, leading=35, textColor=CREAM, spaceAfter=12))
styles.add(ParagraphStyle(name="HeroSub", fontName="Helvetica", fontSize=15, leading=21, textColor=CREAM, spaceAfter=16))
styles.add(ParagraphStyle(name="H1x", fontName="Helvetica-Bold", fontSize=25, leading=28, textColor=INK, spaceAfter=10))
styles.add(ParagraphStyle(name="H2x", fontName="Helvetica-Bold", fontSize=14, leading=17, textColor=INK, spaceBefore=9, spaceAfter=5))
styles.add(ParagraphStyle(name="Bodyx", fontName="Helvetica", fontSize=9.3, leading=13.2, textColor=INK, spaceAfter=6))
styles.add(ParagraphStyle(name="Smallx", fontName="Helvetica", fontSize=7.6, leading=10.5, textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name="Linkx", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=colors.HexColor("#315C62"), spaceAfter=3))
styles.add(ParagraphStyle(name="CenterSmall", fontName="Helvetica", fontSize=8, leading=10, alignment=TA_CENTER, textColor=MUTED))


def p(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"<font color='#9AB73E'>●</font>&nbsp;&nbsp;{text}", styles["Bodyx"])


def section_title(index, title):
    return KeepTogether([p(f"{index} / FINAL PROJECT", "Kicker"), p(title, "H1x")])


story = []

# Cover
cover = Table([
    [p("FROM IDEA TO REALITY / APP USING AI / 2026", "Kicker")],
    [p("MatchPoint AI", "Hero")],
    [p("A smart tennis motion trainer that turns an ordinary smartphone into a motion-tracked racket and provides real-time 3D practice, shot analysis, and coaching on a computer.", "HeroSub")],
    [p("FINAL SUBMISSION PACKAGE", "Kicker")],
], colWidths=[A4[0] - 36 * mm])
cover.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), NAVY),
    ("BOX", (0, 0), (-1, -1), 0, NAVY),
    ("LEFTPADDING", (0, 0), (-1, -1), 18 * mm),
    ("RIGHTPADDING", (0, 0), (-1, -1), 18 * mm),
    ("TOPPADDING", (0, 0), (0, 0), 18 * mm),
    ("BOTTOMPADDING", (0, -1), (0, -1), 16 * mm),
]))
story.extend([cover, Spacer(1, 13 * mm)])

video_text = VIDEO_URL if VIDEO_URL.startswith("http") else f"<font color='#9A4F31'>{VIDEO_URL}</font>"
links = Table([
    [p("VIDEO", "Kicker"), p(video_text, "Linkx")],
    [p("GITHUB", "Kicker"), p(f'<link href="{GITHUB_URL}">{GITHUB_URL}</link>', "Linkx")],
    [p("KANBAN", "Kicker"), p(f'<link href="{KANBAN_URL}">{KANBAN_URL}</link>', "Linkx")],
], colWidths=[31 * mm, A4[0] - 73 * mm])
links.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), PALE),
    ("GRID", (0, 0), (-1, -1), .5, LINE),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
    ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
]))
story.extend([links, Spacer(1, 9 * mm), p("Project summary", "H2x"), p("MatchPoint AI uses Expo DeviceMotion data from a player's phone, sends it through a Socket.IO broker, and maps the calibrated motion to a tennis racket in a Three.js court. Custom physics converts the swing into ball speed, direction, spin, bounce, target results, and live coaching feedback. The player can practice standard feeds, target cones, and configurable wind conditions, then finish the session and download a detailed performance report."), Spacer(1, 5 * mm), p("Submission note", "H2x"), p("This PDF already contains the GitHub link and final Kanban screenshot. Replace the highlighted video placeholder after uploading the final video to Google Drive and setting it to Anyone with the link - Viewer.")])

# Features
story.extend([PageBreak(), section_title("01", "What the application does")])
feature_rows = [
    ("Phone connection", "Expo Go QR flow, LAN Socket.IO connection, permission handling, live connection state, and tennis-ready ghost-racket calibration."),
    ("Motion intelligence", "Quaternion orientation, acceleration and angular motion processing, smoothing and spike rejection, forehand/backhand classification, swing-speed estimate, and contact timing."),
    ("3D tennis training", "Detailed Three.js court, racket, felt ball and net; forehand/backhand feeds; neutral, fast-flat, heavy-topspin and random styles; repeat, alternate and single-shot play."),
    ("Custom physics", "Fixed-step flight with gravity, drag, Magnus force, court bounce, net interaction, world bounds, swept racket collision, and physical first-bounce rulings."),
    ("Target cones", "Deep, regular and short-shot layouts; falling/resetting 3D cones; points, hits, hit rate and streak reporting based on the observed first bounce."),
    ("Wind training", "Off/light/medium/strong wind, eight directions, visible flow, procedural audio and report tracking. Wind modifies the live ball flight within playable bounds."),
    ("Live feedback", "Court Vision, hit/miss, target accuracy, speed, timing, stroke side, shot style, and animated spin, racket-face, arc and follow-through gauges."),
    ("Session analysis", "Player name and reflection, prior-session comparison, coaching priorities, cone/wind results, downloadable HTML report, and raw sensor JSON recording/replay."),
]
feature_table = Table([[p(a, "H2x"), p(b)] for a, b in feature_rows], colWidths=[45 * mm, 119 * mm], repeatRows=0)
feature_table.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LINEBELOW", (0, 0), (-1, -2), .5, LINE),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (0, -1), 5 * mm),
    ("TOPPADDING", (0, 0), (-1, -1), 3.5 * mm),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm),
]))
story.extend([feature_table, Spacer(1, 5 * mm), p("Measurement limits", "H2x"), p("The system uses deterministic sensor processing and coaching rules rather than a trained neural network. Swing speed and technique levels are estimates from one phone. Sensor replay is not video replay, and the application does not claim body-pose or injury analysis.", "Smallx")])

# Tech and architecture
story.extend([PageBreak(), section_title("02", "Technology and system flow")])
stack_data = [
    [p("LAYER", "Kicker"), p("TECHNOLOGY", "Kicker"), p("ROLE", "Kicker")],
    [p("Mobile"), p("Expo SDK 57, React 19, React Native 0.86, expo-sensors"), p("Phone UI and DeviceMotion sampling")],
    [p("Realtime"), p("Socket.IO 4.7"), p("Low-latency motion and calibration events")],
    [p("Server"), p("Node.js, TypeScript"), p("Serves clients, tracks roles and relays state")],
    [p("Desktop 3D"), p("Three.js 0.184, WebGL, GLTFLoader"), p("Court, racket, ball, lighting, targets and welcome scene")],
    [p("Physics"), p("Project-owned TypeScript modules"), p("Flight, spin, bounce, net, bounds and racket collision")],
    [p("Audio/data"), p("Web Audio API, localStorage, HTML/JSON export"), p("Physical sound cues, history and reports")],
    [p("Automation"), p("PowerShell and npm scripts"), p("LAN detection, build, Metro/server startup, QR and browser launch")],
]
stack = Table(stack_data, colWidths=[30 * mm, 65 * mm, 69 * mm], repeatRows=1)
stack.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), TEAL),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("GRID", (0, 0), (-1, -1), .5, LINE),
    ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
    ("RIGHTPADDING", (0, 0), (-1, -1), 3 * mm),
    ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
]))
story.extend([stack, Spacer(1, 8 * mm)])
architecture = Image(str(ROOT / "docs" / "matchpoint-architecture.png"), width=164 * mm, height=63.55 * mm)
story.extend([architecture, Spacer(1, 5 * mm), p("Flow: the phone samples and calibrates DeviceMotion; Socket.IO carries compact packets through the Node.js broker; the PC validates and normalizes motion, updates the racket, evaluates the stroke/contact window, advances custom physics, rules the physical first bounce, and updates the HUD and session report.", "Smallx")])

# Video plan
story.extend([PageBreak(), section_title("03", "Recommended video - 4:45 target")])
timeline = [
    ("0:00-0:20", "Opening", "Cinematic welcome. Say the project name and one-line explanation."),
    ("0:20-0:45", "Architecture", "Show the diagram. Explain Expo sensors -> Socket.IO broker -> Three.js trainer, physics and feedback."),
    ("0:45-1:20", "Connect", "Show npm run all, QR scan, Connect, Start, live racket movement and ghost-racket calibration."),
    ("1:20-2:25", "Training", "Demonstrate forehand, backhand, feed styles, one-ball mode, Court Vision, timing, speed, audio and technique gauges."),
    ("2:25-3:20", "Cone practice", "Choose Deep Shot, hit a cone, show fall/reset, and briefly show Regular and Short Shot choices."),
    ("3:20-3:50", "Wind", "Enable wind, change strength/direction, show the flow and drift, and point out mute."),
    ("3:50-4:35", "Report", "Finish session; show identity/reflection, statistics, coaching, cone/wind results, and downloaded report."),
    ("4:35-4:55", "Evidence", "Show GitHub and Trello; mention automated sensor, physics, report, socket and browser checks."),
]
timeline_table = Table([[p(t, "Kicker"), p(name, "H2x"), p(detail)] for t, name, detail in timeline], colWidths=[27 * mm, 34 * mm, 103 * mm])
timeline_table.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LINEBELOW", (0, 0), (-1, -2), .5, LINE),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ("RIGHTPADDING", (0, 0), (1, -1), 4 * mm),
    ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
]))
story.extend([timeline_table, Spacer(1, 7 * mm), p("Opening narration", "H2x"), p("This is MatchPoint AI, a smart tennis motion trainer that turns an ordinary smartphone into a motion-tracked racket and provides real-time 3D practice, shot analysis, and coaching on a computer."), p("Closing narration", "H2x"), p("MatchPoint AI makes advanced tennis practice accessible with equipment the player already owns: a phone and a computer."), Spacer(1, 4 * mm), p("Record at 1920x1080 or higher, export at 1080p, keep the final file below five minutes, demonstrate every claimed feature, and test the public Google Drive link in an incognito window.", "Smallx")])

# Kanban landscape page
story.extend([NextPageTemplate("Landscape"), PageBreak(), section_title("04", "Final Kanban board")])
board = Image(str(ROOT / "docs" / "kanban-final.png"), width=238 * mm, height=139.52 * mm)
story.extend([board, Spacer(1, 3 * mm), p(f'<link href="{KANBAN_URL}">{KANBAN_URL}</link>', "CenterSmall")])

# Final checklist back to portrait
story.extend([NextPageTemplate("Portrait"), PageBreak(), section_title("05", "Moodle upload checklist")])
for item in [
    "Push the final approved commits to the private GitHub repository.",
    "Confirm the instructor still has access to the repository.",
    "Record and export the final video at 1080p and five minutes or less.",
    "Upload the video to Google Drive and choose Anyone with the link - Viewer.",
    "Open the video link in an incognito browser and verify playback.",
    "Regenerate this PDF with the real video link.",
    "Upload MatchPoint-AI-Final-Submission.pdf to Moodle.",
    "Upload finalproject.zip to Moodle.",
    "Download both Moodle uploads and open them to confirm they are complete and not corrupted.",
]:
    story.append(bullet(item))
story.extend([Spacer(1, 8 * mm), p("Regenerate the PDF after uploading the video", "H2x"), p("PowerShell:"), p("$env:MATCHPOINT_VIDEO_URL='https://drive.google.com/your-public-video-link'<br/>python scripts/create_submission_pdf.py", "Linkx"), Spacer(1, 8 * mm), p("Required Moodle files", "H2x")])
required = Table([
    [p("MatchPoint-AI-Final-Submission.pdf", "Linkx"), p("Video URL, GitHub URL, project information, architecture, and final Kanban screenshot.")],
    [p("finalproject.zip", "Linkx"), p("Source code archive without Git history, dependencies, temporary output, credentials, or local caches.")],
], colWidths=[66 * mm, 98 * mm])
required.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("GRID", (0, 0), (-1, -1), .5, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 4 * mm)]))
story.append(required)

doc.build(story)
print(PDF_PATH)
