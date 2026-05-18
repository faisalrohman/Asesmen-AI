import { Document, Paragraph, TextRun, Packer, HeadingLevel, DefaultStylesFactory } from "docx";
import { saveAs } from "file-saver";

export const exportToWord = async (assessmentData: any, includeAnswers: boolean) => {
  const children = [];

  // Title
  children.push(
    new Paragraph({
      text: `Asesmen: ${assessmentData.materiUtama} - ${assessmentData.subMateri}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 }
    })
  );

  children.push(
    new Paragraph({
      text: `Kelas: ${assessmentData.tingkat} ${assessmentData.kelas}`,
      heading: HeadingLevel.HEADING_3,
      spacing: { after: 400 }
    })
  );

  assessmentData.questions.forEach((q: any, index: number) => {
    children.push(
      new Paragraph({ text: `Soal ${index + 1} (${q.type} - ${q.difficulty})`, heading: HeadingLevel.HEADING_4 })
    );

    if (q.stimulus) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Stimulus: ", italics: true }),
            new TextRun({ text: q.stimulus })
          ],
          spacing: { before: 100, after: 100 }
        })
      );
    }

    children.push(
      new Paragraph({ text: q.question, spacing: { before: 100, after: 100 } })
    );

    if (q.options && q.options.length > 0) {
      q.options.forEach((opt: string) => {
        children.push(
          new Paragraph({ text: `   ${opt}` })
        );
      });
    }

    if (includeAnswers) {
      children.push(
        new Paragraph({
          children: [
             new TextRun({ text: "Jawaban: ", bold: true }),
             new TextRun({ text: q.answer || "-" })
          ],
          spacing: { before: 200 }
        })
      );
      if (q.explanation) {
         children.push(
           new Paragraph({
             children: [
                new TextRun({ text: "Pembahasan: ", bold: true }),
                new TextRun({ text: q.explanation })
             ],
             spacing: { after: 300 }
           })
         );
      }
    } else {
        children.push(new Paragraph({ text: "", spacing: { after: 300 } })); // Spacer
    }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Asesmen_${assessmentData.materiUtama.replace(/\s+/g, "_")}.docx`);
};
