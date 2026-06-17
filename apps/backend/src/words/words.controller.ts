import { Controller, Get } from '@nestjs/common';
import { WordsService } from './words.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('words')
export class WordsController {
  constructor(private readonly words: WordsService) {}

  /** Metadata used by the lobby settings form. */
  @Public()
  @Get('meta')
  meta() {
    return {
      categories: this.words.listCategories(),
      languages: this.words.listLanguages(),
    };
  }
}
