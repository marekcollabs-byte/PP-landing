"""Generate fixed-date printable gift covers. Requires reportlab and DejaVu Sans."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A5, landscape
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'workshop'/'poukazy'; OUT.mkdir(parents=True,exist_ok=True)
for name,file in [('Regular','DejaVuSans.ttf'),('Bold','DejaVuSans-Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name,'/usr/share/fonts/truetype/dejavu/'+file))
W,H=landscape(A5)
for day in (8,15):
    c=canvas.Canvas(str(OUT/f'poukaz-2027-01-{day:02}.pdf'),pagesize=(W,H))
    c.setTitle(f'Dárkový poukaz - workshop první pomoci - {day}. 1. 2027')
    c.setAuthor('Bc. Marek Luskač')
    def txt(x,y,t,size=10,font='Regular',color='#17283b'):
        c.setFillColor(HexColor(color));c.setFont(font,size);c.drawString(x,y,t)
    c.setFillColor(HexColor('#ffffff'));c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(HexColor('#102235'));c.rect(0,H-145,W,145,fill=1,stroke=0)
    c.setFillColor(HexColor('#68ebc3'));c.rect(30,H-39,27,4,fill=1,stroke=0)
    txt(68,H-40,'DÁREK PRO DVA',10,'Bold','#68ebc3')
    txt(W-68,H-44,'PP',21,'Bold','#68ebc3')
    txt(30,H-81,'První pomoc u dětí',27,'Bold','#ffffff')
    txt(30,H-109,'Vyzkoušejte si ji společně. Vlastníma rukama.',12,'Regular','#e4edf6')
    txt(30,H-173,f'{day}. ledna 2027  |  17:00-20:00',17,'Bold')
    txt(30,H-195,'Slavkov u Brna  /  Praktický workshop až pro dvě dospělé osoby',10)
    txt(30,H-226,'PRO:',9,'Bold');txt(285,H-226,'OD:',9,'Bold')
    c.setStrokeColor(HexColor('#b9c4ce'));c.line(61,H-230,265,H-230);c.line(312,H-230,W-30,H-230)
    txt(30,H-257,'ČÍSLO DOKLADU:',9,'Bold');c.line(137,H-261,W-30,H-261)
    txt(30,H-278,'Doplňte číslo z potvrzení platby. Účast ověříme podle zaplacené objednávky.',8)
    txt(30,110,'Nácvik na figurínách. Dva záchranáři. E-book k opakování doma.',9,'Bold')
    txt(30,89,'Poukaz patří ke konkrétnímu zakoupenému termínu a znovu se neuplatňuje.',8)
    txt(30,76,'Samotný tisk nezajišťuje místo. Termín a místo jsou zatím předběžné.',8)
    txt(30,63,'Konání při min. 6 zaplacených dvojicích potvrdíme kupujícímu nejpozději 7 dní předem.',8)
    txt(30,50,'Plánované místo: malý sál SC Bonaparte. Pokyny pošleme kupujícímu před kurzem.',8)
    txt(30,26,'prvnipomoc.eu/workshop',9,'Bold')
    txt(285,26,'marekcollabs@gmail.com  |  773 091 903',8)
    c.save()
